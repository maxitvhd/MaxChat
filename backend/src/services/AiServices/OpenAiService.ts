/**
 * @TercioSantos-0 |
 * services/AiServices/OpenAiService |
 * @descrição: adapter para OpenAI e qualquer endpoint compatível.
 *              POST {openaiUrl}/v1/chat/completions
 */
import { aiRequest, joinUrl, AiHttpError } from "./http";
import { AiSettingsLike, LlmAnswer, isBlank } from "./types";

export const OPENAI_URL_PADRAO = "https://api.openai.com/v1";
export const OPENAI_MODELO_PADRAO = "gpt-4o-mini";

export interface OpenAiRequest {
  settings: AiSettingsLike;
  message: string;
  systemPrompt?: string;
  historico?: { role: "user" | "assistant"; content: string }[];
  temperature?: number;
  maxTokens?: number;
}

export const executarOpenAi = async ({
  settings,
  message,
  systemPrompt,
  historico = [],
  temperature = 0.3,
  maxTokens = 512
}: OpenAiRequest): Promise<string> => {
  if (isBlank(settings.openaiApiKey)) {
    throw new AiHttpError("OpenAI desativado: API key não configurada", 0);
  }

  const base = isBlank(settings.openaiUrl)
    ? OPENAI_URL_PADRAO
    : String(settings.openaiUrl);
  const model = isBlank(settings.openaiModel)
    ? OPENAI_MODELO_PADRAO
    : String(settings.openaiModel);

  const mensagens: { role: string; content: string }[] = [];
  if (!isBlank(systemPrompt))
    mensagens.push({ role: "system", content: String(systemPrompt) });
  historico.forEach(m => mensagens.push({ role: m.role, content: m.content }));
  mensagens.push({ role: "user", content: message });

  // Se a base já terminar em /v1, não repetir o /v1
  const url = /\/v1$/i.test(base.replace(/\/+$/, ""))
    ? joinUrl(base, "/chat/completions")
    : joinUrl(base, "/v1/chat/completions");

  const bruto = await aiRequest<{
    choices?: { message?: { content?: string } }[];
  }>({
    label: "openai",
    method: "POST",
    url,
    timeout: settings.requestTimeout,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.openaiApiKey}`
    },
    data: {
      model,
      messages: mensagens,
      temperature,
      max_tokens: maxTokens,
      stream: false
    }
  });

  const texto = bruto?.choices?.[0]?.message?.content ?? "";
  if (!texto) throw new AiHttpError("OpenAI devolveu resposta vazia", 0);
  return String(texto);
};

export const openAiParaLlmAnswer = (reply: string): LlmAnswer => ({
  reply,
  engine: "openai"
});
