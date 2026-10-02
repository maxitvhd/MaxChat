/**
 * @TercioSantos-0 |
 * services/AiServices/SttService |
 * @descrição: transcrição de áudio.
 *              custom (padrão) -> POST {sttUrl}/stt  (JSON com audio_base64)
 *              azure            -> POST {region}.stt.speech.microsoft.com/speech/recognition
 *              openai           -> POST api.openai.com/v1/audio/transcriptions (multipart)
 */
import { aiRequest, joinUrl, toBuffer, AiHttpError } from "./http";
import { AiSettingsLike, SttProvider, isBlank } from "./types";

export const STT_URL_PADRAO = "http://192.168.1.13:5000";
// O backend Flask desta rede responde melhor com "pt"; "pt-BR" é aceito
// apenas quando a empresa configura explicitamente.
export const STT_IDIOMA_PADRAO = "pt";

export interface SttRequest {
  settings: AiSettingsLike;
  audio: Buffer;
  nomeArquivo?: string;
  mimeType?: string;
  idioma?: string;
}

/**
 * Monta o multipart com o FormData nativo do Node (>=18).
 * Evita depender do pacote "form-data", que hoje só existe como
 * dependência transitiva e não está declarado no package.json.
 */
const montarFormAudio = (
  audio: Buffer,
  nomeArquivo: string,
  mimeType: string,
  campos: Record<string, string>
): FormData => {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(audio)], { type: mimeType });
  form.append("file", blob, nomeArquivo);
  Object.entries(campos).forEach(([chave, valor]) => form.append(chave, valor));
  return form;
};

const extrairTexto = (bruto: unknown): string => {
  if (typeof bruto === "string") return bruto.trim();
  if (!bruto || typeof bruto !== "object") return "";

  const o = bruto as Record<string, unknown>;

  // Azure: RecognitionStatus / DisplayText
  if (Array.isArray(o.RecognitionStatus) && Array.isArray(o.DisplayText)) {
    const status = (o.RecognitionStatus[0] ?? {}) as Record<string, unknown>;
    if (String(status.Success).toLowerCase() === "true")
      return String(o.DisplayText[0] ?? "");
  }
  if (typeof o.text === "string") return o.text.trim();
  if (typeof o.transcript === "string") return o.transcript.trim();
  if (typeof o.transcription === "string") return o.transcription.trim();
  if (typeof o.result === "string") return o.result.trim();
  if (Array.isArray(o.results) && o.results.length) {
    const r = (o.results[0] ?? {}) as Record<string, unknown>;
    const alternativas = r.alternatives as
      | { transcript?: string }[]
      | undefined;
    if (alternativas && alternativas[0]?.transcript)
      return alternativas[0].transcript.trim();
  }
  return "";
};

const chamarCustom = async ({
  settings,
  audio,
  nomeArquivo,
  mimeType,
  idioma
}: SttRequest): Promise<string> => {
  const base = isBlank(settings.sttUrl)
    ? STT_URL_PADRAO
    : String(settings.sttUrl);

  // Contrato real (validado contra 192.168.1.13:5000):
  //   POST /stt  {"audio_base64": "...", "language": "pt"}
  //   -> {"text": "...", "language": "pt", "duration_seconds": 2.52}
  // multipart com campo "file" é recusado com 400.
  const bruto = await aiRequest<unknown>({
    label: "stt-custom",
    method: "POST",
    url: joinUrl(base, "/stt"),
    timeout: settings.requestTimeout,
    headers: {
      "Content-Type": "application/json",
      ...(isBlank(settings.sttApiKey)
        ? {}
        : { Authorization: `Bearer ${settings.sttApiKey}` })
    },
    data: {
      audio_base64: audio.toString("base64"),
      language: idioma || STT_IDIOMA_PADRAO,
      filename: nomeArquivo || "audio.ogg",
      mime_type: mimeType || "audio/ogg"
    }
  });

  return extrairTexto(bruto);
};

const chamarAzure = async ({
  settings,
  audio,
  mimeType
}: SttRequest): Promise<string> => {
  if (isBlank(settings.sttApiKey)) {
    throw new AiHttpError("Azure STT desativado: API key não configurada", 0);
  }
  const regiao = isBlank(settings.ttsRegion)
    ? "eastus"
    : String(settings.ttsRegion);

  const bruto = await aiRequest<unknown>({
    label: "stt-azure",
    method: "POST",
    responseType: "arraybuffer",
    url: `https://${regiao}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${STT_IDIOMA_PADRAO}`,
    timeout: settings.requestTimeout,
    headers: {
      Accept: "application/json;text/xml",
      "Content-Type": mimeType || "audio/ogg",
      "Ocp-Apim-Subscription-Key": String(settings.sttApiKey)
    },
    data: toBuffer(audio)
  });

  return extrairTexto(bruto);
};

const chamarOpenAi = async ({
  settings,
  audio,
  nomeArquivo,
  mimeType
}: SttRequest): Promise<string> => {
  const key = isBlank(settings.sttApiKey)
    ? settings.openaiApiKey
    : settings.sttApiKey;
  if (isBlank(key)) {
    throw new AiHttpError("OpenAI STT desativado: API key não configurada", 0);
  }

  const form = montarFormAudio(
    audio,
    nomeArquivo || "audio.mp3",
    mimeType || "audio/mpeg",
    {
      model: isBlank(settings.sttModel)
        ? "whisper-1"
        : String(settings.sttModel),
      language: "pt"
    }
  );

  const bruto = await aiRequest<unknown>({
    label: "stt-openai",
    method: "POST",
    url: "https://api.openai.com/v1/audio/transcriptions",
    timeout: settings.requestTimeout,
    headers: { Authorization: `Bearer ${key}` },
    data: form
  });

  return extrairTexto(bruto);
};

export const transcreverAudio = async (
  request: SttRequest
): Promise<string> => {
  const { settings, audio } = request;

  if (!audio || audio.length === 0) {
    throw new AiHttpError("Áudio vazio para transcrever", 400);
  }

  const provider = String(
    settings.sttProvider ?? SttProvider.CUSTOM
  ).toLowerCase();
  if (provider === SttProvider.DISABLED) {
    throw new AiHttpError("STT desativado nas configurações da empresa", 0);
  }

  switch (provider) {
    case SttProvider.AZURE:
      return chamarAzure(request);
    case SttProvider.OPENAI:
      return chamarOpenAi(request);
    case SttProvider.CUSTOM:
    default:
      return chamarCustom(request);
  }
};
