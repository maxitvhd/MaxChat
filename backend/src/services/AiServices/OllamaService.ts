/**
 * @TercioSantos-0 |
 * services/AiServices/OllamaService |
 * @descrição: adapter para Ollama com API compatível com OpenAI.
 *              GET  {ollamaUrl}/v1/models
 *              POST {ollamaUrl}/v1/chat/completions
 */
import { aiRequest, joinUrl, AiHttpError } from "./http";
import { AiSettingsLike, LlmAnswer, isBlank } from "./types";

export const OLLAMA_URL_PADRAO = "http://127.0.0.1:11434";
export const OLLAMA_MODELO_PADRAO = "qwen3.5:4b";

export interface OllamaModel {
  id: string;
  family?: string;
  parameterSize?: string;
  quantization?: string;
}

export const listarModelosOllama = async (
  settings: AiSettingsLike
): Promise<OllamaModel[]> => {
  const base = isBlank(settings.ollamaUrl)
    ? OLLAMA_URL_PADRAO
    : String(settings.ollamaUrl);

  const bruto = await aiRequest<{
    data?: { id: string; [k: string]: unknown }[];
  }>({
    label: "ollama-modelos",
    method: "GET",
    url: joinUrl(base, "/v1/models"),
    timeout: settings.requestTimeout,
    retries: 0
  });

  return (bruto?.data ?? []).map(m => ({
    id: m.id,
    family: typeof m.family === "string" ? m.family : undefined,
    parameterSize:
      typeof m.parameter_size === "string"
        ? (m.parameter_size as string)
        : undefined,
    quantization:
      typeof m.quantization_level === "string"
        ? (m.quantization_level as string)
        : undefined
  }));
};

export interface OllamaRequest {
  settings: AiSettingsLike;
  message: string;
  systemPrompt?: string;
  historico?: { role: "user" | "assistant"; content: string }[];
  temperature?: number;
  maxTokens?: number;
}

export const executarOllama = async ({
  settings,
  message,
  systemPrompt,
  historico = [],
  temperature = 0.3,
  maxTokens = 512
}: OllamaRequest): Promise<string> => {
  const base = isBlank(settings.ollamaUrl)
    ? OLLAMA_URL_PADRAO
    : String(settings.ollamaUrl);
  const model = isBlank(settings.ollamaModel)
    ? OLLAMA_MODELO_PADRAO
    : String(settings.ollamaModel);

  const mensagens: { role: string; content: string }[] = [];
  if (!isBlank(systemPrompt))
    mensagens.push({ role: "system", content: String(systemPrompt) });
  historico.forEach(m => mensagens.push({ role: m.role, content: m.content }));
  mensagens.push({ role: "user", content: message });

  const bruto = await aiRequest<{
    choices?: { message?: { content?: string } }[];
  }>({
    label: "ollama",
    method: "POST",
    url: joinUrl(base, "/v1/chat/completions"),
    timeout: settings.requestTimeout,
    headers: { "Content-Type": "application/json" },
    data: {
      model,
      messages: mensagens,
      stream: false,
      temperature,
      max_tokens: maxTokens
    }
  });

  const texto = bruto?.choices?.[0]?.message?.content ?? "";
  if (!texto) throw new AiHttpError("Ollama devolveu resposta vazia", 0);
  return String(texto);
};

export const ollamaParaLlmAnswer = (reply: string): LlmAnswer => ({
  reply,
  engine: "ollama"
});

export const OLLAMA_EMBEDDING_PADRAO = "nomic-embed-text";

/**
 * Gera vetor de embedding via Ollama.
 * POST {ollamaUrl}/api/embed  -> { embeddings: number[][] }
 *
 * Usado pela memória do Qdrant: o mesmo modelo precisa ser usado para gravar
 * e para buscar, senão a distância de cosseno fica sem sentido.
 */
export const gerarEmbedding = async (
  settings: AiSettingsLike,
  texto: string
): Promise<number[]> => {
  if (!texto || !texto.trim()) {
    throw new AiHttpError("Texto vazio para gerar embedding", 400);
  }

  const base = isBlank(settings.ollamaUrl)
    ? OLLAMA_URL_PADRAO
    : String(settings.ollamaUrl);
  const model = isBlank(settings.embeddingModel)
    ? OLLAMA_EMBEDDING_PADRAO
    : String(settings.embeddingModel);

  const bruto = await aiRequest<{
    embeddings?: number[][];
    embedding?: number[];
  }>({
    label: "ollama-embedding",
    method: "POST",
    url: joinUrl(base, "/api/embed"),
    timeout: settings.requestTimeout,
    headers: { "Content-Type": "application/json" },
    data: { model, input: texto }
  });

  const vetor = bruto?.embeddings?.[0] ?? bruto?.embedding ?? [];
  if (!vetor.length) {
    throw new AiHttpError("Ollama devolveu embedding vazio", 0);
  }
  return vetor.map(Number);
};
