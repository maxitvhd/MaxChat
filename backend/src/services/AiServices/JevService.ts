/**
 * @TercioSantos-0 |
 * services/AiServices/JevService |
 * @descrição: adapter para TypeSafe SystemOne (JEV).
 *
 *              Contrato real (validado contra api.typesafe.ai/openapi.json):
 *              POST {jevUrl}/v1/systemone
 *                Request : { model, state, questions }
 *                Response: { model, answers: { <id>: Answer }, usage }
 *
 *              O JEV NÃO gera texto: ele classifica (choice), mede confiança
 *              (score) e pode se abster (noul). A resposta em texto vem do LLM.
 *              Erros 429/529 são transitorios e ficam a cargo do aiRequest.
 */
import logger from "../../utils/logger";
import { aiRequest, joinUrl, AiHttpError } from "./http";
import { AiSettingsLike, LlmAnswer, isBlank } from "./types";

export const JEV_PRIMITIVES = ["choice", "score", "noul"];

export const JEV_URL_PADRAO = "https://api.typesafe.ai";
export const JEV_MODELO_PADRAO = "jev-latest";

/** Pergunta de choice: criteria = { <rotulo>: { instructions } } */
export interface JevChoiceQuestion {
  type: "choice";
  criteria: Record<string, { instructions: string } | string>;
  instructions?: string;
}

/** Pergunta de score: criteria = [{ instructions, criteria: { legends, scale } }] */
export interface JevScoreQuestion {
  type: "score";
  criteria: Array<{
    instructions: string;
    criteria: { legends: string[]; scale?: number };
  }>;
}

/** Pergunta de noul: criteria = { true, false } opcional. */
export interface JevNoulQuestion {
  type: "noul";
  criteria?: { true?: string; false?: string };
  instructions?: string;
}

export type JevQuestion =
  | JevChoiceQuestion
  | JevScoreQuestion
  | JevNoulQuestion;

export type JevQuestions = Record<string, JevQuestion>;

export interface JevAnswer {
  /** id da pergunta (ex.: "q1") */
  id: string;
  type: string;
  /** rótulo escolhido em perguntas do tipo choice */
  choice?: string;
  /** índice/valor em perguntas do tipo score */
  score?: number;
  /** true = o JEV optou por se abster (noul) */
  noul?: boolean;
  confidence: number | null;
  /** legenda vencedora em perguntas do tipo score */
  legend?: string | null;
  probabilities: Record<string, number>;
  raw: unknown;
}

export interface JevResult {
  /** respostas por pergunta, na ordem em que foram declaradas */
  answers: JevAnswer[];
  /** primeira resposta, que define a decisão de roteamento */
  primary: JevAnswer | null;
  confidence: number | null;
  /** rótulo escolhido pela primeira pergunta de choice */
  intencao: string | null;
  /** legenda vencedora da primeira pergunta de score */
  scoreLegenda: string | null;
  abstained: boolean;
  reply: string;
  slots: Record<string, unknown>;
  reasoning: string | null;
  notSureReason: string | null;
  usage: { input_tokens: number; output_tokens: number } | null;
  model: string | null;
  raw: unknown;
}

/**
 * Spec padrão usada quando a empresa não configurou jevQuestions.
 * Cobre os dois casos de uso mais comuns: triagem de intenção e
 * aferição da certeza da resposta.
 */
export const JEV_QUESTIONS_PADRAO: JevQuestions = {
  intencao: {
    type: "choice",
    criteria: {
      duvida_produto:
        "O cliente quer saber sobre produto, prazo, preço ou status de um pedido?",
      suporte_tecnico: "O cliente relata um problema técnico ou erro de uso?",
      reclamacao:
        "O cliente está insatisfeito ou reclamando de um atendimento?",
      outro: "Nenhum dos anteriores."
    }
  },
  certeza: {
    type: "score",
    criteria: [
      {
        instructions:
          "A informação do cliente é suficiente para responder com segurança?",
        criteria: {
          legends: [
            "Sim, dá para responder com segurança",
            "Parcialmente, falta confirmar um detalhe",
            "Não, não há informação suficiente"
          ],
          scale: 3
        }
      }
    ]
  }
};

const objeto = (valor: unknown): Record<string, unknown> =>
  valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};

const limitar01 = (valor: unknown): number | null => {
  if (valor === null || valor === undefined) return null;
  const n = Number(valor);
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(1, n));
};

/** Lê as perguntas configuradas, com fallback para a spec padrão. */
export const lerJevQuestions = (settings: AiSettingsLike): JevQuestions => {
  if (isBlank(settings.jevQuestions)) return JEV_QUESTIONS_PADRAO;

  try {
    const parseado = JSON.parse(String(settings.jevQuestions));
    const perguntas = objeto(parseado);
    const validas = Object.entries(perguntas).filter(([, v]) => {
      const q = objeto(v);
      return JEV_PRIMITIVES.includes(String(q.type));
    });

    if (!validas.length) return JEV_QUESTIONS_PADRAO;

    return validas.reduce(
      (acc: JevQuestions, [id, q]) => ({ ...acc, [id]: q as JevQuestion }),
      {}
    );
  } catch (e) {
    logger.warn(
      `[JEV] jevQuestions inválido, usando spec padrão: ${(e as Error).message}`
    );
    return JEV_QUESTIONS_PADRAO;
  }
};

const lerProbabilidades = (bruto: unknown): Record<string, number> => {
  const probs = objeto(objeto(bruto).probabilities);
  return Object.entries(probs).reduce(
    (acc: Record<string, number>, [chave, valor]) => {
      const n = Number(valor);
      if (!Number.isNaN(n)) acc[chave] = n;
      return acc;
    },
    {}
  );
};

/**
 * Extrai a legenda vencedora de uma resposta score.
 * A API devolve {"0": {instructions, criteria}} mapeado pelo índice vencedor.
 */
const lerLegenda = (bruto: Record<string, unknown>): string | null => {
  const lenda = objeto(bruto.legend);
  const probs = objeto(bruto.probabilities);

  // Índice vencedor: maior probabilidade, ou o próprio score.
  let indice: string | null = null;
  if (bruto.score !== undefined && bruto.score !== null) {
    indice = String(bruto.score);
  } else {
    const vencedora = Object.keys(probs).sort(
      (a, b) => Number(probs[b]) - Number(probs[a])
    )[0];
    if (vencedora) {
      indice = vencedora;
    }
  }

  if (indice === null) return null;
  const entrada = objeto(lenda[indice]);
  const criterios = objeto(entrada.criteria);
  const { legends } = criterios;
  if (Array.isArray(legends)) {
    const texto = legends[Number(indice)];
    if (typeof texto === "string" && texto) return texto;
  }
  return null;
};

/** Converte a resposta da API no formato interno, question por question. */
export const normalizarJev = (bruto: unknown): JevResult => {
  const base = objeto(bruto);
  const answersBrutos = objeto(base.answers);

  const answers: JevAnswer[] = Object.entries(answersBrutos).map(
    ([id, valor]) => {
      const r = objeto(valor);
      return {
        id,
        type: String(r.type ?? ""),
        ...(typeof r.choice === "string" ? { choice: r.choice } : {}),
        ...(r.score !== undefined && r.score !== null
          ? { score: Number(r.score) }
          : {}),
        ...(r.noul !== undefined ? { noul: Boolean(r.noul) } : {}),
        confidence: limitar01(r.confidence),
        legend: lerLegenda(r),
        probabilities: lerProbabilidades(r),
        raw: valor
      };
    }
  );

  const primary = answers[0] ?? null;
  const escolha = answers.find(a => a.type === "choice");
  const score = answers.find(a => a.type === "score");
  const noul = answers.find(a => a.type === "noul");

  // A confiança do JEV é a da pergunta de score (certeza) quando existir;
  // senão usa a confiança da escolha.
  const confidence = score?.confidence ?? primary?.confidence ?? null;

  const usageBruto = objeto(base.usage);
  const usage =
    usageBruto.input_tokens !== undefined ||
    usageBruto.output_tokens !== undefined
      ? {
          input_tokens: Number(usageBruto.input_tokens ?? 0),
          output_tokens: Number(usageBruto.output_tokens ?? 0)
        }
      : null;

  const slots: Record<string, unknown> = { ...escolha?.probabilities };
  if (escolha?.choice) slots.intencao = escolha.choice;
  if (score?.legend) slots.certeza = score.legend;

  return {
    answers,
    primary,
    confidence,
    intencao: escolha?.choice ?? null,
    scoreLegenda: score?.legend ?? null,
    abstained: Boolean(noul?.noul),
    reply: escolha?.choice ?? score?.legend ?? "",
    slots,
    reasoning: null,
    notSureReason: noul?.noul ? "O JEV optou por se abster (noul)." : null,
    usage,
    model: typeof base.model === "string" ? base.model : null,
    raw: bruto
  };
};

export interface JevRequest {
  settings: AiSettingsLike;
  message: string;
  slots?: Record<string, unknown>;
  /** sobrescreve a spec configurada na empresa */
  questions?: JevQuestions;
  historico?: { role: "user" | "assistant"; content: string }[];
}

/**
 * Monta o `state`: o contexto que o JEV vai classificar.
 * Histórico e slots entram como linhas de contexto para não poluir a pergunta.
 */
const montarState = (
  message: string,
  slots: Record<string, unknown>,
  historico: { role: "user" | "assistant"; content: string }[]
): string => {
  const linhas: string[] = [];

  const slotsTexto = Object.entries(slots)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([chave, valor]) => {
      const texto = Array.isArray(valor) ? valor.join(", ") : String(valor);
      return `${chave}: ${texto}`;
    });

  if (slotsTexto.length)
    linhas.push(`Contexto da conversa: ${slotsTexto.join(" | ")}`);
  if (historico.length) {
    linhas.push(
      `Histórico:\n${historico
        .slice(-6)
        .map(
          h => `${h.role === "user" ? "Cliente" : "Atendente"}: ${h.content}`
        )
        .join("\n")}`
    );
  }
  linhas.push(`Mensagem do cliente: ${message}`);

  return linhas.join("\n");
};

/**
 * Executa o roteamento no JEV e devolve o pacote interpretado.
 * Lança AiHttpError quando a URL ou a chave não estiverem configuradas.
 */
export const executarJev = async ({
  settings,
  message,
  slots = {},
  questions,
  historico = []
}: JevRequest): Promise<JevResult> => {
  if (isBlank(settings.jevUrl) && isBlank(settings.jevApiKey)) {
    throw new AiHttpError("JEV desativado: URL e API key não configuradas", 0);
  }
  if (isBlank(settings.jevApiKey)) {
    throw new AiHttpError("JEV desativado: API key não configurada", 0);
  }

  const url = joinUrl(
    isBlank(settings.jevUrl) ? JEV_URL_PADRAO : String(settings.jevUrl),
    "/v1/systemone"
  );
  const model = isBlank(settings.jevModel)
    ? JEV_MODELO_PADRAO
    : String(settings.jevModel);

  const payload = {
    model,
    state: montarState(message, slots, historico),
    questions: questions ?? lerJevQuestions(settings)
  };

  const bruto = await aiRequest<unknown>({
    label: "jev",
    method: "POST",
    url,
    timeout: settings.requestTimeout,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.jevApiKey}`
    },
    data: payload
  });

  const resultado = normalizarJev(bruto);
  logger.info(
    `[JEV] model=${resultado.model} intencao=${
      resultado.intencao ?? "-"
    } certeza=${resultado.scoreLegenda ?? "-"} confidence=${
      resultado.confidence
    } tokens=${
      resultado.usage
        ? `${resultado.usage.input_tokens}/${resultado.usage.output_tokens}`
        : "-"
    }`
  );
  return resultado;
};

export const MENSAGEM_ESCALONAMENTO =
  "Não tenho certeza suficiente para responder isso agora. Vou encaminhar para um atendente.";

/**
 * Converte o resultado do JEV em decisão de roteamento.
 *
 * O JEV não escreve a resposta ao cliente: ele classifica e mede certeza.
 * Quando a certeza é alta devolvemos `podeResponder: true` e o chamador segue
 * para o LLM. Quando é baixa (ou o JEV se abstém), devolvemos a mensagem de
 * escalonamento para o cliente e `podeResponder: false`.
 */
export const jevParaLlmAnswer = (
  resultado: JevResult,
  settings: AiSettingsLike
): LlmAnswer => {
  const limiar = Number(settings.routingConfidenceThreshold ?? 0.7);
  const confident = resultado.confidence;
  const abaixoDoLimiar =
    confident !== null && confident < limiar ? true : resultado.abstained;

  const podeResponder = !(abaixoDoLimiar && settings.fallbackOnLowConfidence);

  let reply: string;
  if (podeResponder) {
    reply = MENSAGEM_ESCALONAMENTO;
  } else if (resultado.notSureReason) {
    reply = `${MENSAGEM_ESCALONAMENTO} (${resultado.notSureReason})`;
  } else {
    reply = MENSAGEM_ESCALONAMENTO;
  }

  return {
    reply,
    confidence: confident,
    engine: "jev",
    reasoning: `intencao=${resultado.intencao ?? "-"} certeza=${
      resultado.scoreLegenda ?? "-"
    }`,
    notSureReason: podeResponder
      ? null
      : resultado.notSureReason ?? MENSAGEM_ESCALONAMENTO,
    raw: {
      podeResponder,
      intencao: resultado.intencao,
      scoreLegenda: resultado.scoreLegenda,
      abstained: resultado.abstained,
      answers: resultado.answers,
      usage: resultado.usage
    }
  };
};
