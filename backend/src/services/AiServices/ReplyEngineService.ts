/**
 * @TercioSantos-0 |
 * services/AiServices/ReplyEngineService |
 * @descrição: resolve qual motor de resposta usar e executa.
 *
 *              Ordem de precedência:
 *              1. replyEngine do prompt da fila (override)  - tem prioridade
 *              2. defaultReplyEngine da empresa
 *
 *              Se o módulo estiver desligado ou o motor for "default",
 *              devolve null e o chamador segue o fluxo atual do bot.
 */
import logger from "../../utils/logger";
import { AiHttpError } from "./http";
import { executarJev, jevParaLlmAnswer } from "./JevService";
import {
  executarLaya,
  layaParaLlmAnswer,
  LAYA_PRIMITIVE_MEMORY
} from "./LayaService";
import { executarOllama, ollamaParaLlmAnswer } from "./OllamaService";
import { executarOpenAi, openAiParaLlmAnswer } from "./OpenAiService";
import { executarGemini, geminiParaLlmAnswer } from "./GeminiService";
import { executarAnthropic, anthropicParaLlmAnswer } from "./AnthropicService";
import { AiSettingsLike, LlmAnswer, ReplyEngine } from "./types";

export interface ResolverMotorParams {
  settings: AiSettingsLike;
  replyEngineDoPrompt?: string | null;
}

/** Decide o motor efetivo da requisição. */
export const resolverMotor = ({
  settings,
  replyEngineDoPrompt
}: ResolverMotorParams): string => {
  if (!settings.enabled) return ReplyEngine.DEFAULT;

  const override = replyEngineDoPrompt?.trim();
  if (override && override !== ReplyEngine.DEFAULT) return override;

  const padrao = String(settings.defaultReplyEngine ?? ReplyEngine.DEFAULT);
  return padrao || ReplyEngine.DEFAULT;
};

export interface ExecutarRespostaParams {
  settings: AiSettingsLike;
  message: string;
  engine: string;
  systemPrompt?: string;
  slots?: Record<string, unknown>;
  historico?: { role: "user" | "assistant"; content: string }[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * Executa o motor informado e devolve o LlmAnswer.
 * Erros do provider sobem como AiHttpError para o chamador decidir o fallback.
 */
export const executarResposta = async ({
  settings,
  message,
  engine,
  systemPrompt,
  slots = {},
  historico = [],
  temperature,
  maxTokens
}: ExecutarRespostaParams): Promise<LlmAnswer> => {
  switch (engine) {
    case ReplyEngine.JEV: {
      const resultado = await executarJev({ settings, message, slots });
      return jevParaLlmAnswer(resultado, settings);
    }

    case ReplyEngine.LAYA: {
      const resultado = await executarLaya({
        settings,
        message,
        systemPrompt,
        slots,
        primitive: LAYA_PRIMITIVE_MEMORY,
        historico,
        temperature,
        maxTokens
      });
      return layaParaLlmAnswer(resultado, settings);
    }

    case ReplyEngine.OPENAI: {
      const texto = await executarOpenAi({
        settings,
        message,
        systemPrompt,
        historico,
        temperature,
        maxTokens
      });
      return openAiParaLlmAnswer(texto);
    }

    case ReplyEngine.GEMINI: {
      const texto = await executarGemini({
        settings,
        message,
        systemPrompt,
        historico,
        temperature,
        maxTokens
      });
      return geminiParaLlmAnswer(texto);
    }

    case ReplyEngine.ANTHROPIC: {
      const texto = await executarAnthropic({
        settings,
        message,
        systemPrompt,
        historico,
        temperature,
        maxTokens
      });
      return anthropicParaLlmAnswer(texto);
    }

    case ReplyEngine.OLLAMA: {
      const texto = await executarOllama({
        settings,
        message,
        systemPrompt,
        historico,
        temperature,
        maxTokens
      });
      return ollamaParaLlmAnswer(texto);
    }

    default:
      throw new AiHttpError(`Motor de resposta desconhecido: ${engine}`, 400);
  }
};

export interface RotearParams {
  settings: AiSettingsLike;
  message: string;
  slots?: Record<string, unknown>;
  historico?: { role: "user" | "assistant"; content: string }[];
}

export interface ResultadoRoteamento {
  /** null quando o roteamento está desligado. */
  resposta: LlmAnswer | null;
  /** mensagem de erro quando o roteamento falhou e há fallback. */
  erro?: string;
}

/**
 * Roteia a mensagem via JEV ou Laya.
 * Nunca lança: se falhar e houver fallback, devolve null para o chamador
 * seguir o fluxo normal do atendimento humano.
 */
export const rotearMensagem = async ({
  settings,
  message,
  slots = {},
  historico = []
}: RotearParams): Promise<ResultadoRoteamento> => {
  const roteamento = String(settings.routingEngine ?? "disabled");

  if (roteamento === "disabled") {
    return { resposta: null };
  }

  try {
    const resposta =
      roteamento === ReplyEngine.JEV
        ? jevParaLlmAnswer(
            await executarJev({ settings, message, slots, historico }),
            settings
          )
        : layaParaLlmAnswer(
            await executarLaya({
              settings,
              message,
              slots,
              historico,
              primitive: "routing"
            }),
            settings
          );

    return { resposta };
  } catch (e) {
    const m = (e as Error)?.message ?? "erro desconhecido";
    logger.error(`[Roteamento:${roteamento}] falha: ${m}`);

    // resposta null = não responder com IA e seguir o fluxo humano.
    // O campo "erro" fica disponível para o chamador decidir o que fazer
    // quando fallbackOnLowConfidence estiver desligado.
    return { resposta: null, erro: m };
  }
};
