/**
 * @TercioSantos-0 |
 * services/AiServices/MessageAiBridge |
 * @descrição: ponto único de entrada do módulo de IA no fluxo de mensagens.
 *
 *              Responsabilidades (nesta ordem):
 *                1. Carrega a configuração da empresa (AiProviderSettings).
 *                2. Decide se o módulo responde (enabled + engine != default).
 *                3. Recupera memória relevante do Qdrant (quando ligado).
 *                4. Roda o roteador (JEV/Laya) para medir confiança.
 *                5. Chama o motor de texto e devolve a resposta final.
 *
 *              Regra de ouro: NUNCA lança. Qualquer falha devolve
 *              { respondeu: false } para o chamador seguir o fluxo
 *              humano/chatbot legado sem quebrar o atendimento.
 */
import { randomUUID } from "crypto";
import logger from "../../utils/logger";
import ShowAiProviderSettingsService from "../AiProviderSettingsServices/ShowAiProviderSettingsService";
import { ReplyEngine, AiSettingsLike, LlmAnswer } from "./types";
import {
  resolverMotor,
  executarResposta,
  rotearMensagem
} from "./ReplyEngineService";
import { gerarEmbedding } from "./OllamaService";
import {
  buscarMemorias,
  registrarMemoria,
  criarColecao
} from "./QdrantService";

export interface MensagemAiContexto {
  companyId: number;
  /** texto recebido do contato */
  mensagem: string;
  /** histórico recente, do mais antigo ao mais recente */
  historico?: { role: "user" | "assistant"; content: string }[];
  /** prompt da empresa/fila, usado como system prompt */
  systemPrompt?: string;
  /** override por prompt (Prompts.replyEngine) */
  replyEngineDoPrompt?: string | null;
  /** identificador estável do contato, para isolar a memória */
  contatoId?: string | number;
}

export interface MensagemAiResultado {
  /** true quando o módulo respondeu e o texto deve ser enviado */
  respondeu: boolean;
  reply?: string;
  engine?: string;
  confidence?: number | null;
  /** motivo pelo qual a IA não respondeu (útil para log) */
  motivo?: string;
  /** memórias recuperadas do Qdrant */
  memorias?: number;
}

/**
 * Monta o ID do ponto no Qdrant.
 *
 * O Qdrant aceita apenas inteiro unsigned ou UUID: string livre é recusada
 * com 400 ("value X is not a valid point ID"). Cada mensagem vira um ponto
 * próprio (id único), senão a resposta do assistente sobrescreveria a
 * pergunta do cliente no mesmo id.
 */
const pontoId = (): string => randomUUID();

/**
 * Busca memórias relevantes e devolve um bloco de contexto para o prompt.
 * Falhas de memória nunca derrubam a resposta.
 */
const recuperarMemoria = async (
  settings: AiSettingsLike,
  companyId: number,
  mensagem: string,
  contatoId?: string | number
): Promise<{ contexto: string; total: number }> => {
  const slug = settings.memoryCollection || "memoria";

  try {
    const vetor = await gerarEmbedding(settings, mensagem);
    const achados = await buscarMemorias({
      settings,
      companyId,
      slug,
      vetor,
      limite: Number(settings.maxHistoryMessages ?? 5),
      contatoId
    });

    if (!achados.length) return { contexto: "", total: 0 };

    const linhas = achados.map((a, i) => {
      const p = a.payload ?? {};
      const quem = p.role === "user" ? "Cliente" : "Atendente";
      return `[${i + 1}] ${quem}: ${String(p.texto ?? "").trim()}`;
    });

    return {
      contexto: linhas.join("\n"),
      total: achados.length
    };
  } catch (e) {
    logger.warn(
      `[IA] memória indisponível (${
        (e as Error).message
      }), seguindo sem contexto`
    );
    return { contexto: "", total: 0 };
  }
};

/** Grava a mensagem na memória da empresa. Nunca lança. */
const gravarMemoria = async (
  settings: AiSettingsLike,
  companyId: number,
  mensagem: string,
  role: "user" | "assistant",
  contatoId?: string | number
): Promise<void> => {
  if (!contatoId) return;
  const slug = settings.memoryCollection || "memoria";

  try {
    const vetor = await gerarEmbedding(settings, mensagem);

    // Garante que a coleção exista antes do primeiro registro.
    await criarColecao({ settings, companyId }, slug, vetor.length).catch(
      () => null
    );

    await registrarMemoria({
      settings,
      companyId,
      slug,
      pontoId: pontoId(),
      vetor,
      payload: {
        role,
        texto: mensagem,
        contatoId: String(contatoId),
        em: new Date().toISOString()
      }
    });
  } catch (e) {
    logger.warn(`[IA] falha ao gravar memória: ${(e as Error).message}`);
  }
};

/**
 * Decide e produz a resposta de IA.
 * Retorna sempre um objeto; nunca lança.
 */
export const processarMensagemComIa = async (
  ctx: MensagemAiContexto
): Promise<MensagemAiResultado> => {
  const { companyId, mensagem, contatoId } = ctx;

  if (!mensagem || !mensagem.trim()) {
    return { respondeu: false, motivo: "mensagem vazia" };
  }

  let settings: AiSettingsLike;
  try {
    const model = await ShowAiProviderSettingsService({ companyId });
    settings = model.toJSON() as unknown as AiSettingsLike;
  } catch (e) {
    logger.error(
      `[IA] falha ao carregar configuração: ${(e as Error).message}`
    );
    return { respondeu: false, motivo: "configuração indisponível" };
  }

  if (!settings.enabled) {
    return { respondeu: false, motivo: "módulo desligado" };
  }

  const engine = resolverMotor({
    settings,
    replyEngineDoPrompt: ctx.replyEngineDoPrompt
  });

  if (!engine || engine === ReplyEngine.DEFAULT) {
    return { respondeu: false, motivo: "motor default (usar fluxo atual)" };
  }

  // ---- 1) memória ------------------------------------------------------
  let contexto = "";
  let memorias = 0;
  const querMemoria =
    settings.memoryEnabled &&
    Boolean(settings.qdrantEnabled) &&
    Boolean(settings.embeddingModel || settings.ollamaUrl);

  if (querMemoria) {
    const r = await recuperarMemoria(settings, companyId, mensagem, contatoId);
    contexto = r.contexto;
    memorias = r.total;
  }

  // ---- 2) system prompt ------------------------------------------------
  const blocos: string[] = [];
  if (ctx.systemPrompt?.trim()) blocos.push(ctx.systemPrompt.trim());
  if (contexto) {
    blocos.push(
      `Histórico relevante recuperado da base de memória:\n${contexto}`
    );
  }
  const systemPrompt = blocos.length ? blocos.join("\n\n") : undefined;

  // ---- 3) roteador (confiança) ----------------------------------------
  let confianca: number | null = null;
  if (settings.routingEngine && settings.routingEngine !== "disabled") {
    const rota = await rotearMensagem({
      settings,
      message: mensagem,
      slots: {},
      historico: ctx.historico ?? []
    });

    if (rota.resposta) {
      confianca = rota.resposta.confidence ?? null;
      const podeResponder = (rota.resposta.raw as { podeResponder?: boolean })
        ?.podeResponder;

      if (podeResponder === false && settings.fallbackOnLowConfidence) {
        logger.info(
          `[IA] roteador não respondeu (confiança=${confianca}), enviando escalonamento`
        );
        await gravarMemoria(
          settings,
          companyId,
          mensagem,
          "user",
          ctx.contatoId
        );
        return {
          respondeu: true,
          reply: rota.resposta.reply,
          engine,
          confidence: confianca,
          memorias,
          motivo: "escalonamento por baixa confiança"
        };
      }
    }
  }

  // ---- 4) motor de texto ----------------------------------------------
  let resposta: LlmAnswer;
  try {
    resposta = await executarResposta({
      settings,
      message: mensagem,
      engine,
      systemPrompt,
      historico: ctx.historico ?? []
    });
  } catch (e) {
    logger.error(`[IA] motor ${engine} falhou: ${(e as Error).message}`);
    return {
      respondeu: false,
      engine,
      motivo: `motor ${engine} indisponível`,
      memorias
    };
  }

  if (!resposta?.reply?.trim()) {
    return { respondeu: false, engine, motivo: "resposta vazia", memorias };
  }

  // ---- 5) memória (grava ida e volta) --------------------------------
  if (querMemoria) {
    await gravarMemoria(settings, companyId, mensagem, "user", ctx.contatoId);
    await gravarMemoria(
      settings,
      companyId,
      resposta.reply,
      "assistant",
      ctx.contatoId
    );
  }

  logger.info(
    `[IA] respondeu com engine=${
      resposta.engine
    } memorias=${memorias} confianca=${resposta.confidence ?? confianca ?? "-"}`
  );

  return {
    respondeu: true,
    reply: resposta.reply,
    engine: resposta.engine,
    confidence: resposta.confidence ?? confianca,
    memorias
  };
};

export default processarMensagemComIa;
