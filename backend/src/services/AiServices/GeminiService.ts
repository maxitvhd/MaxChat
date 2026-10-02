/**
 * @TercioSantos-0 |
 * services/AiServices/GeminiService |
 * @descrição: adapter para Google Gemini (generateContent).
 *              POST {geminiUrl}/v1beta/models/{model}:generateContent
 *              A key pode ir no header x-goog-api-key ou na query (configuravel).
 */
import { aiRequest, joinUrl, AiHttpError } from "./http";
import { AiSettingsLike, LlmAnswer, isBlank } from "./types";

export const GEMINI_URL_PADRAO = "https://generativelanguage.googleapis.com";
export const GEMINI_MODELO_PADRAO = "gemini-2.5-flash";

export interface GeminiRequest {
  settings: AiSettingsLike;
  message: string;
  systemPrompt?: string;
  historico?: { role: "user" | "assistant"; content: string }[];
  temperature?: number;
  maxTokens?: number;
}

export const executarGemini = async ({
  settings,
  message,
  systemPrompt,
  historico = [],
  temperature = 0.3,
  maxTokens = 512
}: GeminiRequest): Promise<string> => {
  if (isBlank(settings.geminiApiKey)) {
    throw new AiHttpError("Gemini desativado: API key não configurada", 0);
  }

  const base = isBlank(settings.geminiUrl)
    ? GEMINI_URL_PADRAO
    : String(settings.geminiUrl);
  const model = isBlank(settings.geminiModel)
    ? GEMINI_MODELO_PADRAO
    : String(settings.geminiModel);

  const conteudo = historico.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));
  conteudo.push({ role: "user", parts: [{ text: message }] });

  const corpo: Record<string, unknown> = {
    contents: conteudo,
    generationConfig: { temperature, maxOutputTokens: maxTokens }
  };
  if (!isBlank(systemPrompt))
    corpo.systemInstruction = { parts: [{ text: String(systemPrompt) }] };

  const bruto = await aiRequest<{
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  }>({
    label: "gemini",
    method: "POST",
    url: joinUrl(base, `/v1beta/models/${model}:generateContent`),
    timeout: settings.requestTimeout,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": String(settings.geminiApiKey)
    },
    data: corpo
  });

  const texto =
    bruto?.candidates?.[0]?.content?.parts?.map(p => p.text ?? "").join("") ??
    "";
  if (!texto) throw new AiHttpError("Gemini devolveu resposta vazia", 0);
  return String(texto);
};

export const geminiParaLlmAnswer = (reply: string): LlmAnswer => ({
  reply,
  engine: "gemini"
});
