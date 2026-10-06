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
import { recuperarConhecimento } from "./KnowledgeRetrievalService";

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
  /** modelo específico definido no prompt da fila (sobrescreve o do provedor) */
  modeloDoPrompt?: string | null;
  /** temperatura definida no prompt da fila */
  temperatura?: number | null;
  /** teto de tokens definido no prompt da fila */
  maxTokens?: number | null;
  /** identificador estável do contato, para isolar a memória */
  contatoId?: string | number;
  /**
   * Fila/produto do ticket. Define quais bases de conhecimento entram na
   * conversa: entra a base geral da empresa e as bases desta fila.
   */
  queueId?: number | null;
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
  /** trechos da base de conhecimento recuperados */
  conhecimento?: number;
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

    // Garante a coleção antes de buscar: em empresa nova a coleção ainda não
    // existe e o Qdrant responde 404, o que fazia a busca falhar sempre.
    await criarColecao({ settings, companyId }, slug, vetor.length).catch(
      () => null
    );

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
 * Piso de instrução: garante português e resposta útil mesmo quando a fila
 * ainda não tem prompt cadastrado.
 */
const PROMPT_PADRAO = [
  "Você é um assistente de atendimento de uma empresa brasileira.",
  "Responda SEMPRE em português do Brasil.",
  "Seja educado, direto e objetivo, usando no máximo 3 frases.",
  "Se não souber a resposta, diga que vai encaminhar para um atendente humano.",
  "Nunca responda em inglês e nunca invente informações."
].join(" ");

/**
 * Nome do campo de modelo em AiProviderSettings para o motor informado.
 * Permite que o prompt da fila escolha um modelo específico sem mexer na
 * configuração global da empresa.
 */
const modeloDoEngine = (engine: string): string => {
  switch (engine) {
    case ReplyEngine.OLLAMA:
      return "ollamaModel";
    case ReplyEngine.OPENAI:
      return "openaiModel";
    case ReplyEngine.GEMINI:
      return "geminiModel";
    case ReplyEngine.ANTHROPIC:
      return "anthropicModel";
    case ReplyEngine.JEV:
      return "jevModel";
    case ReplyEngine.LAYA:
      return "layaModel";
    default:
      return "ollamaModel";
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

  // ---- 1b) base de conhecimento ---------------------------------------
  // Entra a base geral da empresa e as bases da fila deste ticket. Base de
  // outro produto não é lida. Falha aqui nunca derruba a resposta.
  const conhecimento = await recuperarConhecimento(
    { settings, companyId, queueId: ctx.queueId },
    mensagem
  );

  // ---- 2) system prompt ------------------------------------------------
  const blocos: string[] = [];

  // Sem prompt configurado o modelo_small responde em inglês e inventa
  // ("I'm not sure what you mean by..."). Este piso garante português.
  blocos.push(PROMPT_PADRAO);

  if (ctx.systemPrompt?.trim()) blocos.push(ctx.systemPrompt.trim());
  if (contexto) {
    blocos.push(
      `Histórico relevante recuperado da base de memória:\n${contexto}`
    );
  }
  if (conhecimento.contexto) {
    blocos.push(conhecimento.contexto);
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
          conhecimento: conhecimento.total,
          motivo: "escalonamento por baixa confiança"
        };
      }
    }
  }

  // ---- 4) motor de texto ----------------------------------------------
  // Modelo/temperatura/tokens do prompt da fila sobrepõem os do provedor.
  const settingsMotor: AiSettingsLike = {
    ...settings,
    ...(ctx.modeloDoPrompt?.trim()
      ? { [modeloDoEngine(engine)]: ctx.modeloDoPrompt.trim() }
      : {}),
    ...(ctx.temperatura != null ? { temperature: ctx.temperatura } : {})
  };

  let resposta: LlmAnswer;
  try {
    resposta = await executarResposta({
      settings: settingsMotor,
      message: mensagem,
      engine,
      systemPrompt,
      historico: ctx.historico ?? [],
      ...(ctx.maxTokens ? { maxTokens: ctx.maxTokens } : {})
    });
  } catch (e) {
    logger.error(`[IA] motor ${engine} falhou: ${(e as Error).message}`);
    return {
      respondeu: false,
      engine,
      motivo: `motor ${engine} indisponível`,
      memorias,
      conhecimento: conhecimento.total
    };
  }

  if (!resposta?.reply?.trim()) {
    return {
      respondeu: false,
      engine,
      motivo: "resposta vazia",
      memorias,
      conhecimento: conhecimento.total
    };
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
    } memorias=${memorias} conhecimento=${conhecimento.total} confianca=${
      resposta.confidence ?? confianca ?? "-"
    }`
  );

  return {
    respondeu: true,
    reply: resposta.reply,
    engine: resposta.engine,
    confidence: resposta.confidence ?? confianca,
    memorias,
    conhecimento: conhecimento.total
  };
};

export default processarMensagemComIa;
