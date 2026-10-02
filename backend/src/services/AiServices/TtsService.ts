/**
 * @TercioSantos-0 |
 * services/AiServices/TtsService |
 * @descrição: geração de voz com 5 providers.
 *              custom (padrão)  -> POST {ttsUrl}/v1/audio/speech (formato OpenAI)
 *              azure             -> POST {region}.tts.speech.microsoft.com/cognitiveservices/v1 (SSML)
 *              azureopenai       -> POST {ttsEndpoint}/openai/v1/audio/speech?api-version=preview
 *              gemini            -> POST generativelanguage.../{model}:generateContent (base64)
 *              openai            -> POST api.openai.com/v1/audio/speech
 *
 *              Aviso importante: as vozes do Gemini e do OpenAI sao otimizadas
 *              para ingles. Para português, prefira custom (Piper) ou azure.
 */
import { aiRequest, joinUrl, toBuffer, AiHttpError } from "./http";
import { garantirWav } from "./pcm";
import { AiSettingsLike, TtsAudio, TtsProvider, isBlank } from "./types";

export const TTS_VOZ_PADRAO = "pt-BR-FabioNeural";
export const TTS_URL_PADRAO = "http://192.168.1.13:5000";

const MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  aac: "audio/aac",
  pcm: "audio/wav"
};

const escaparXml = (texto: string): string =>
  texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export interface TtsRequest {
  settings: AiSettingsLike;
  texto: string;
  voz?: string;
  formato?: string;
  velocidade?: number;
}

const montarAudio = (
  data: unknown,
  formato: string,
  forcarWav = false
): TtsAudio => {
  const buffer = toBuffer(data);
  const formatoNormalizado = formato.toLowerCase();
  const precisaWav = forcarWav || !Buffer.isBuffer(data) || buffer.length === 0;

  if (precisaWav) {
    return {
      buffer: garantirWav(buffer),
      mimeType: "audio/wav",
      extension: "wav"
    };
  }

  if (formatoNormalizado === "pcm" || formatoNormalizado === "wav") {
    return {
      buffer: garantirWav(buffer),
      mimeType: MIME.wav,
      extension: "wav"
    };
  }

  return {
    buffer,
    mimeType: MIME[formatoNormalizado] ?? "application/octet-stream",
    extension: formatoNormalizado
  };
};

// ----------------------------------------------------------------- custom (padrão)
/** Nossa API (Flask/Piper). Formato OpenAI: { model, input, voice, response_format, speed }. */
const chamarCustom = async ({
  settings,
  texto,
  voz,
  formato,
  velocidade
}: TtsRequest): Promise<TtsAudio> => {
  const base = isBlank(settings.ttsUrl)
    ? TTS_URL_PADRAO
    : String(settings.ttsUrl);

  const data = await aiRequest<unknown>({
    label: "tts-custom",
    method: "POST",
    responseType: "arraybuffer",
    url: joinUrl(base, "/v1/audio/speech"),
    timeout: settings.requestTimeout,
    headers: {
      "Content-Type": "application/json",
      ...(isBlank(settings.ttsApiKey)
        ? {}
        : { Authorization: `Bearer ${settings.ttsApiKey}` })
    },
    data: {
      model: isBlank(settings.ttsModel) ? "tts-1" : String(settings.ttsModel),
      input: texto,
      voice: voz,
      response_format: formato,
      speed: velocidade
    }
  });

  return montarAudio(data, formato);
};

// ----------------------------------------------------------------- azure (SSML)
/** Azure Speech Service. Vozes pt-BR: pt-BR-FranciscaNeural, pt-BR-AntonioNeural, pt-BR-ThalitaNeural. */
const chamarAzure = async ({
  settings,
  texto,
  voz,
  formato,
  velocidade
}: TtsRequest): Promise<TtsAudio> => {
  if (isBlank(settings.ttsApiKey)) {
    throw new AiHttpError("Azure TTS desativado: API key não configurada", 0);
  }
  const regiao = isBlank(settings.ttsRegion)
    ? "eastus"
    : String(settings.ttsRegion);
  const host = `https://${regiao}.tts.speech.microsoft.com`;

  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pt-BR">
  <voice name="${escaparXml(voz)}">
    <prosody rate="${(velocidade * 100).toFixed(0)}%">${escaparXml(
    texto
  )}</prosody>
  </voice>
</speak>`;

  const data = await aiRequest<unknown>({
    label: "tts-azure",
    method: "POST",
    responseType: "arraybuffer",
    url: joinUrl(host, "/cognitiveservices/v1"),
    timeout: settings.requestTimeout,
    headers: {
      "Content-Type": "application/ssml+xml",
      "Ocp-Apim-Subscription-Key": String(settings.ttsApiKey),
      "X-Microsoft-OutputFormat": `audio-24khz-48kbitrate-mono-${formato}`,
      "User-Agent": "MaxChat"
    },
    data: ssml
  });

  return montarAudio(data, formato);
};

// ----------------------------------------------------------------- azure openai
/** Azure OpenAI TTS: precisa do endpoint do resource e do nome do deployment. */
const chamarAzureOpenAi = async ({
  settings,
  texto,
  voz,
  formato,
  velocidade
}: TtsRequest): Promise<TtsAudio> => {
  if (isBlank(settings.ttsApiKey)) {
    throw new AiHttpError(
      "Azure OpenAI TTS desativado: API key não configurada",
      0
    );
  }
  if (isBlank(settings.ttsEndpoint)) {
    throw new AiHttpError(
      "Azure OpenAI TTS desativado: endpoint não configurado",
      0
    );
  }

  const base = String(settings.ttsEndpoint).replace(/\/+$/, "");
  const modelo = isBlank(settings.ttsDeployment)
    ? "tts-1"
    : String(settings.ttsDeployment);

  const data = await aiRequest<unknown>({
    label: "tts-azureopenai",
    method: "POST",
    responseType: "arraybuffer",
    url: `${base}/openai/v1/audio/speech?api-version=preview`,
    timeout: settings.requestTimeout,
    headers: {
      "Content-Type": "application/json",
      "api-key": String(settings.ttsApiKey)
    },
    data: {
      input: texto,
      model: modelo,
      voice: voz,
      response_format: formato,
      speed: velocidade
    }
  });

  return montarAudio(data, formato);
};

// ----------------------------------------------------------------- gemini
/** Gemini TTS. Vozes disponiveis sao majoritariamente em ingles. */
const chamarGemini = async ({
  settings,
  texto,
  voz,
  formato
}: TtsRequest): Promise<TtsAudio> => {
  if (isBlank(settings.geminiApiKey)) {
    throw new AiHttpError("Gemini TTS desativado: API key não configurada", 0);
  }

  const base = isBlank(settings.geminiUrl)
    ? "https://generativelanguage.googleapis.com"
    : String(settings.geminiUrl);
  const modelo = isBlank(settings.ttsModel)
    ? "gemini-2.5-flash-preview-tts"
    : String(settings.ttsModel);

  const bruto = await aiRequest<{
    candidates?: {
      content?: {
        parts?: { inlineData?: { data?: string; mimeType?: string } }[];
      };
    }[];
  }>({
    label: "tts-gemini",
    method: "POST",
    url: joinUrl(base, `/v1beta/models/${modelo}:generateContent`),
    timeout: settings.requestTimeout,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": String(settings.geminiApiKey)
    },
    data: {
      contents: [{ parts: [{ text: texto }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } }
        }
      }
    }
  });

  const parte = bruto?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!parte?.data) throw new AiHttpError("Gemini TTS devolveu áudio vazio", 0);

  const audio = Buffer.from(parte.data, "base64");

  // PCM cru (modelos 2.5) precisa de header; modelos 3.x ja devolvem WAV completo.
  if (
    formato.toLowerCase() === "wav" ||
    !audio.toString("ascii", 0, 4).startsWith("RIFF")
  ) {
    return {
      buffer: garantirWav(audio),
      mimeType: "audio/wav",
      extension: "wav"
    };
  }

  return montarAudio(audio, formato);
};

// ----------------------------------------------------------------- openai
/** OpenAI TTS. Vozes otimizadas para ingles. */
const chamarOpenAi = async ({
  settings,
  texto,
  voz,
  formato,
  velocidade
}: TtsRequest): Promise<TtsAudio> => {
  const key = isBlank(settings.ttsApiKey)
    ? settings.openaiApiKey
    : settings.ttsApiKey;
  if (isBlank(key)) {
    throw new AiHttpError("OpenAI TTS desativado: API key não configurada", 0);
  }

  const base = isBlank(settings.ttsUrl)
    ? "https://api.openai.com/v1"
    : String(settings.ttsUrl);
  const modelo = isBlank(settings.ttsModel)
    ? "gpt-4o-mini-tts"
    : String(settings.ttsModel);

  const data = await aiRequest<unknown>({
    label: "tts-openai",
    method: "POST",
    responseType: "arraybuffer",
    url: /\/v1$/i.test(base.replace(/\/+$/, ""))
      ? joinUrl(base, "/audio/speech")
      : joinUrl(base, "/v1/audio/speech"),
    timeout: settings.requestTimeout,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    data: {
      model: modelo,
      input: texto,
      voice: voz,
      response_format: formato === "wav" ? "wav" : "mp3",
      speed: velocidade
    }
  });

  return montarAudio(data, formato);
};

/** Lista as vozes pt-BR conhecidas da nossa API (Piper/Azure Neural). */
export const VOZES_PT_BR = [
  "pt-BR-FabioNeural",
  "pt-BR-AntonioNeural",
  "pt-BR-DonatoNeural",
  "pt-BR-HumbertoNeural",
  "pt-BR-FranciscaNeural",
  "pt-BR-ThalitaNeural"
];

export const gerarAudio = async (request: TtsRequest): Promise<TtsAudio> => {
  const { settings, texto } = request;

  if (isBlank(texto)) {
    throw new AiHttpError("Texto vazio para gerar áudio", 400);
  }

  const provider = String(
    settings.ttsProvider ?? TtsProvider.CUSTOM
  ).toLowerCase();
  if (provider === TtsProvider.DISABLED) {
    throw new AiHttpError("TTS desativado nas configurações da empresa", 0);
  }

  const voz = request.voz || settings.ttsVoice || TTS_VOZ_PADRAO;
  const formato = (
    request.formato ||
    settings.ttsFormat ||
    "mp3"
  ).toLowerCase();
  const velocidade = Number(request.velocidade ?? settings.ttsSpeed ?? 1);

  const enriched: TtsRequest = { ...request, voz, formato, velocidade };

  switch (provider) {
    case TtsProvider.AZURE:
      return chamarAzure(enriched);
    case TtsProvider.AZURE_OPENAI:
      return chamarAzureOpenAi(enriched);
    case TtsProvider.GEMINI:
      return chamarGemini(enriched);
    case TtsProvider.OPENAI:
      return chamarOpenAi(enriched);
    case TtsProvider.CUSTOM:
    default:
      return chamarCustom(enriched);
  }
};
