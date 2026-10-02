/**
 * @TercioSantos-0 |
 * services/AiServices/AnthropicService |
 * @descrição: adapter para Anthropic Claude (Messages API).
 *              POST {anthropicUrl}/v1/messages
 *              Exige o header x-api-key e a versao da API.
 */
import { aiRequest, joinUrl, AiHttpError } from "./http";
import { AiSettingsLike, LlmAnswer, isBlank } from "./types";

export const ANTHROPIC_URL_PADRAO = "https://api.anthropic.com";
export const ANTHROPIC_MODELO_PADRAO = "claude-3-5-sonnet-latest";
export const ANTHROPIC_VERSAO = "2023-06-01";

export interface AnthropicRequest {
  settings: AiSettingsLike;
  message: string;
  systemPrompt?: string;
  historico?: { role: "user" | "assistant"; content: string }[];
  temperature?: number;
  maxTokens?: number;
}

export const executarAnthropic = async ({
  settings,
  message,
  systemPrompt,
  historico = [],
  temperature = 0.3,
  maxTokens = 1024
}: AnthropicRequest): Promise<string> => {
  if (isBlank(settings.anthropicApiKey)) {
    throw new AiHttpError("Anthropic desativado: API key não configurada", 0);
  }

  const base = isBlank(settings.anthropicUrl)
    ? ANTHROPIC_URL_PADRAO
    : String(settings.anthropicUrl);
  const model = isBlank(settings.anthropicModel)
    ? ANTHROPIC_MODELO_PADRAO
    : String(settings.anthropicModel);

  const mensagens = historico.map(m => ({ role: m.role, content: m.content }));
  mensagens.push({ role: "user" as const, content: message });

  const corpo: Record<string, unknown> = {
    model,
    messages: mensagens,
    max_tokens: maxTokens,
    temperature
  };
  if (!isBlank(systemPrompt)) corpo.system = String(systemPrompt);

  const bruto = await aiRequest<{
    content?: { type?: string; text?: string }[];
  }>({
    label: "anthropic",
    method: "POST",
    url: joinUrl(base, "/v1/messages"),
    timeout: settings.requestTimeout,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": String(settings.anthropicApiKey),
      "anthropic-version": ANTHROPIC_VERSAO
    },
    data: corpo
  });

  const texto = (bruto?.content ?? [])
    .filter(c => c.type === "text" || isBlank(c.type))
    .map(c => c.text ?? "")
    .join("");
  if (!texto) throw new AiHttpError("Anthropic devolveu resposta vazia", 0);
  return texto;
};

export const anthropicParaLlmAnswer = (reply: string): LlmAnswer => ({
  reply,
  engine: "anthropic"
});
