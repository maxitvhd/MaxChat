/**
 * @TercioSantos-0 |
 * services/AiServices/LayaService |
 * @descrição: adapter para o servidor Laya remoto (URL + key configuráveis).
 *              Como o contrato HTTP do Laya oficial não é documentado, o
 *              adapter conversa com o formato OpenAI-compatible
 *              (POST {layaUrl}/v1/chat/completions) e tambem aceita
 *              respostas em formatos proprios do Laya (generation/response/
 *              reply/text) ou MCP (result/content).
 *              Trocar de servidor e so trocar layaUrl + layaApiKey.
 */
import logger from "../../utils/logger";
import { aiRequest, joinUrl, AiHttpError } from "./http";
import { AiSettingsLike, LlmAnswer, isBlank } from "./types";

export const LAYA_PRIMITIVE_ROUTING = "routing";
export const LAYA_PRIMITIVE_MEMORY = "memory";

interface LayaPayload {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  /** Metadados livres: slots da conversa e primitive pedida. */
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Extrai texto de qualquer formato de resposta do Laya:
 * string, array de partes, ou objeto com text/content/reply/output/message.
 */
const primeiroTexto = (valor: unknown): string => {
  if (typeof valor === "string") return valor;

  if (Array.isArray(valor)) {
    return valor
      .map(v => primeiroTexto(v))
      .join("")
      .trim();
  }

  if (valor && typeof valor === "object") {
    const o = valor as Record<string, unknown>;
    const candidatos: unknown[] = [
      o.text,
      o.content,
      o.reply,
      o.output,
      o.message,
      o.answer
    ];

    // Devolve o primeiro candidato que gerar texto.
    const extraido = candidatos
      .map(candidato => {
        if (typeof candidato === "string") return candidato;
        if (
          Array.isArray(candidato) ||
          (candidato && typeof candidato === "object")
        ) {
          return primeiroTexto(candidato);
        }
        return "";
      })
      .find(texto => texto.trim().length > 0);

    return extraido ?? "";
  }

  return "";
};

export interface LayaResult {
  reply: string;
  confidence: number | null;
  slots: Record<string, unknown>;
  raw: unknown;
}

/** Extrai a resposta do Laya dos diferentes envelopes possíveis. */
export const normalizarLaya = (bruto: unknown): LayaResult => {
  const base = (bruto && typeof bruto === "object" ? bruto : {}) as Record<
    string,
    unknown
  >;

  // OpenAI-compatible
  let texto = "";
  if (Array.isArray(base.choices)) {
    const choice = base.choices[0] as Record<string, unknown> | undefined;
    if (choice) {
      texto = primeiroTexto(choice.message) || primeiroTexto(choice.text);
      if (choice.finish_reason === "noul" && !texto) texto = "";
    }
  }

  // Envelopes Laya / MCP
  if (!texto)
    texto = primeiroTexto(base.result ?? base.generation ?? base.response);
  if (!texto) {
    texto =
      primeiroTexto(base.reply) ||
      primeiroTexto(base.text) ||
      primeiroTexto(base.output) ||
      primeiroTexto(base.content) ||
      primeiroTexto(base.answer);
  }

  const confidenceBruto = base.confidence ?? base.score ?? null;
  const confidence =
    confidenceBruto === null || confidenceBruto === undefined
      ? null
      : Math.max(0, Math.min(1, Number(confidenceBruto)));

  const slotsBruto = (
    base.slots && typeof base.slots === "object" && !Array.isArray(base.slots)
      ? base.slots
      : {}
  ) as Record<string, unknown>;

  return {
    reply: texto.trim(),
    confidence: Number.isNaN(Number(confidence)) ? null : confidence,
    slots: slotsBruto,
    raw: bruto
  };
};

export interface LayaRequest {
  settings: AiSettingsLike;
  message: string;
  systemPrompt?: string;
  slots?: Record<string, unknown>;
  primitive?: string;
  historico?: { role: "user" | "assistant"; content: string }[];
  temperature?: number;
  maxTokens?: number;
}

const montarHistorico = (
  systemPrompt?: string,
  historico: { role: "user" | "assistant"; content: string }[] = []
): { role: string; content: string }[] => {
  const mensagens: { role: string; content: string }[] = [];
  if (!isBlank(systemPrompt))
    mensagens.push({ role: "system", content: String(systemPrompt) });
  historico.forEach(m => mensagens.push({ role: m.role, content: m.content }));
  return mensagens;
};

/**
 * Chama o Laya no formato OpenAI-compatible.
 * Lança AiHttpError se URL/key não estiverem configuradas.
 */
export const executarLaya = async ({
  settings,
  message,
  systemPrompt,
  slots = {},
  primitive = LAYA_PRIMITIVE_ROUTING,
  historico = [],
  temperature = 0.3,
  maxTokens = 512
}: LayaRequest): Promise<LayaResult> => {
  if (isBlank(settings.layaUrl)) {
    throw new AiHttpError("Laya desativado: URL não configurada", 0);
  }
  if (isBlank(settings.layaApiKey)) {
    throw new AiHttpError("Laya desativado: API key não configurada", 0);
  }

  const payload: LayaPayload = {
    model: isBlank(settings.layaModel) ? "default" : String(settings.layaModel),
    messages: [
      ...montarHistorico(systemPrompt, historico),
      { role: "user", content: message }
    ],
    temperature,
    max_tokens: maxTokens,
    stream: false,
    metadata: { primitive, slots }
  };

  const bruto = await aiRequest<unknown>({
    label: "laya",
    method: "POST",
    url: joinUrl(String(settings.layaUrl), "/v1/chat/completions"),
    timeout: settings.requestTimeout,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.layaApiKey}`
    },
    data: payload
  });

  const resultado = normalizarLaya(bruto);
  logger.info(
    `[Laya] resposta="${resultado.reply.slice(0, 120)}" confidence=${
      resultado.confidence
    }`
  );
  return resultado;
};

/** Converte o resultado do Laya em LlmAnswer aplicando o limiar de confiança. */
export const layaParaLlmAnswer = (
  resultado: LayaResult,
  settings: AiSettingsLike
): LlmAnswer => {
  const limiar = Number(settings.routingConfidenceThreshold ?? 0.7);
  const abaixoDoLimiar =
    resultado.confidence !== null && resultado.confidence < limiar;

  let reply: string;
  if (abaixoDoLimiar && settings.fallbackOnLowConfidence) {
    reply =
      "Não tenho certeza suficiente para responder isso agora. Vou encaminhar para um atendente.";
  } else {
    reply = resultado.reply || "";
  }

  return {
    reply,
    confidence: resultado.confidence,
    engine: "laya",
    raw: resultado.raw
  };
};
