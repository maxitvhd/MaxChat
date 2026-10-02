/**
 * @TercioSantos-0 |
 * services/AiServices/types |
 * @descrição: tipos e enums compartilhados pelos serviços de IA
 */

export const ReplyEngine = {
  DEFAULT: "default",
  JEV: "jev",
  LAYA: "laya",
  OPENAI: "openai",
  GEMINI: "gemini",
  ANTHROPIC: "anthropic",
  OLLAMA: "ollama"
} as const;

export type ReplyEngineValue = (typeof ReplyEngine)[keyof typeof ReplyEngine];

export const RoutingEngine = {
  DISABLED: "disabled",
  JEV: "jev",
  LAYA: "laya"
} as const;

export const TtsProvider = {
  DISABLED: "disabled",
  CUSTOM: "custom",
  AZURE: "azure",
  AZURE_OPENAI: "azureopenai",
  GEMINI: "gemini",
  OPENAI: "openai"
} as const;

export const SttProvider = {
  DISABLED: "disabled",
  CUSTOM: "custom",
  AZURE: "azure",
  OPENAI: "openai"
} as const;

/** Campos sensíveis: nunca retornam o valor real para o frontend. */
export const SECRET_FIELDS = [
  "openaiApiKey",
  "geminiApiKey",
  "anthropicApiKey",
  "jevApiKey",
  "layaApiKey",
  "ttsApiKey",
  "sttApiKey",
  "qdrantApiKey"
] as const;

export const MASK = "********";

export interface AiSettingsLike {
  companyId?: number;
  enabled?: boolean;
  defaultReplyEngine?: string;
  routingEngine?: string;
  routingConfidenceThreshold?: number;
  fallbackOnLowConfidence?: boolean;
  requestTimeout?: number;
  memoryEnabled?: boolean;
  maxHistoryMessages?: number;
  ollamaUrl?: string;
  ollamaModel?: string;
  openaiUrl?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  geminiUrl?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  anthropicUrl?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  jevUrl?: string;
  jevApiKey?: string;
  jevModel?: string;
  /** spec de perguntas do JEV em JSON */
  jevQuestions?: string;
  layaUrl?: string;
  layaApiKey?: string;
  layaModel?: string;
  ttsProvider?: string;
  ttsUrl?: string;
  ttsApiKey?: string;
  ttsModel?: string;
  ttsVoice?: string;
  ttsFormat?: string;
  ttsSpeed?: number;
  ttsRegion?: string;
  ttsEndpoint?: string;
  ttsDeployment?: string;
  sttProvider?: string;
  sttUrl?: string;
  sttApiKey?: string;
  sttModel?: string;
  qdrantEnabled?: boolean;
  qdrantUrl?: string;
  qdrantApiKey?: string;
  qdrantCollectionPrefix?: string;
  /** modelo de embedding (Ollama) usado na memória do Qdrant */
  embeddingModel?: string;
  /** coleção/slug onde a memória da empresa é gravada */
  memoryCollection?: string;
  [key: string]: unknown;
}

export interface LlmAnswer {
  /** Texto final devolvido ao contato. */
  reply: string;
  /** Confiança declarada pelo roteador (0 a 1). */
  confidence?: number;
  /** Engine realmente usada para produzir a resposta. */
  engine: string;
  /** Pacote de pensamento do JEV, quando disponível. */
  reasoning?: string | null;
  /** Motivo da recusa/abstenção, quando o JEV usa a primitiva noul. */
  notSureReason?: string | null;
  /** Resposta bruta do provider, para auditoria. */
  raw?: unknown;
}

export interface TtsAudio {
  buffer: Buffer;
  mimeType: string;
  extension: string;
}

export const DEFAULT_TIMEOUT = 30000;

export const isBlank = (value?: string | null): boolean =>
  !value || String(value).trim().length === 0;
