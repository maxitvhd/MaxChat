/**
 * @TercioSantos-0 |
 * services/AiServices/KnowledgeRetrievalService |
 * @descrição: recupera trechos da base de conhecimento para a IA do WhatsApp.
 *
 *              Regras de escopo:
 *              - só bases ATIVAS da própria empresa;
 *              - entra a base geral da empresa (queueId nulo) e as bases
 *                amarradas à fila do ticket. Base de outro produto nunca é
 *                lida, mesmo pertencendo à mesma empresa;
 *              - falhas de busca nunca derrubam a resposta do bot: no pior
 *                caso o modelo responde sem o bloco de conhecimento.
 */
import KnowledgeBase from "../../models/KnowledgeBase";
import logger from "../../utils/logger";
import { AiSettingsLike } from "./types";
import { gerarEmbedding } from "./OllamaService";
import { criarColecao, buscarMemorias } from "./QdrantService";
import { ehFilaTriagem } from "./rotaTriagem";

const LOG = "KnowledgeRetrieval";

export const LIMITE_PEDIDOS = 3;
export const TRECHOS_POR_BASE = 3;
export const MAX_CARACTERES = 3500;

export interface TrechoConhecimento {
  baseId: number;
  baseNome: string;
  documentoId: number;
  titulo: string;
  texto: string;
  score: number;
  fonte?: string;
}

interface ContextoRecuperacao {
  settings: AiSettingsLike;
  companyId: number;
  /** Fila do ticket. Se não vier, só a base geral é usada. */
  queueId?: number | null;
}

/** Bases que a empresa pode usar nesta conversa. */
export const basesVisiveis = async ({
  companyId,
  queueId
}: {
  companyId: number;
  queueId?: number | null;
}): Promise<KnowledgeBase[]> => {
  const where: Record<string, unknown> = { companyId, active: true };

  return KnowledgeBase.findAll({
    where,
    order: [["id", "ASC"]],
    limit: LIMITE_PEDIDOS + 10
  }).then(todas =>
    queueId === undefined || queueId === null
      ? todas.filter(b => !b.queueId)
      : todas.filter(b => !b.queueId || b.queueId === queueId)
  );
};

const formatarTrechos = (trechos: TrechoConhecimento[]): string =>
  trechos
    .map((t, i) => {
      const fonte = t.fonte ? ` (fonte: ${t.fonte})` : "";
      return `[${i + 1}] ${t.baseNome} › ${t.titulo}${fonte}\n${t.texto}`;
    })
    .join("\n\n");

/**
 * Devolve os trechos relevantes e o bloco de texto pronto para o prompt.
 * Devolve string vazia quando não há base, base sem documento ou erro.
 */
export const recuperarConhecimento = async (
  ctx: ContextoRecuperacao,
  pergunta: string
): Promise<{ contexto: string; total: number }> => {
  try {
    if (!ctx.settings.qdrantEnabled) return { contexto: "", total: 0 };
    if (!pergunta?.trim()) return { contexto: "", total: 0 };

    // A Triagem existe para descobrir de qual produto o cliente está falando.
    // Injetar conhecimento aqui faria ela responder com o produto errado em
    // vez de encaminhar, então a base fica desligada para essa fila.
    if (ctx.queueId && (await ehFilaTriagem(ctx.queueId))) {
      return { contexto: "", total: 0 };
    }

    const bases = await basesVisiveis({
      companyId: ctx.companyId,
      queueId: ctx.queueId
    });
    if (!bases.length) return { contexto: "", total: 0 };

    const vetor = await gerarEmbedding(ctx.settings, pergunta);
    const trechos: TrechoConhecimento[] = [];

    for (const base of bases.slice(0, LIMITE_PEDIDOS)) {
      // Coleção pode não existir ainda: base recém-criada sem documento.
      // Base recém-criada ainda não tem coleção no Qdrant. O erro aqui é
      // esperado e ignorado: a busca logo abaixo apenas não acha nada.
      await criarColecao(
        { settings: ctx.settings, companyId: ctx.companyId },
        base.slug,
        vetor.length
      ).catch(() => null);

      const achados = await buscarMemorias({
        settings: ctx.settings,
        companyId: ctx.companyId,
        slug: base.slug,
        vetor,
        limite: TRECHOS_POR_BASE,
        _scoreMinimo: Number(base.minScore ?? 0.45),
        filtrosExtras: base.queueId ? { queueId: base.queueId } : undefined
      });

      achados.forEach(a => {
        const payload = a.payload ?? {};
        trechos.push({
          baseId: base.id,
          baseNome: base.name,
          documentoId: Number(payload.documentId ?? 0),
          titulo: String(payload.title ?? "Documento"),
          texto: String(payload.text ?? "").trim(),
          score: a.score,
          fonte: payload.sourceUrl
            ? String(payload.sourceUrl)
            : payload.fileName
            ? String(payload.fileName)
            : undefined
        });
      });
    }

    const uteis = trechos
      .filter(t => t.texto.length > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, TRECHOS_POR_BASE * LIMITE_PEDIDOS);

    if (!uteis.length) return { contexto: "", total: 0 };

    const texto = formatarTrechos(uteis).slice(0, MAX_CARACTERES);

    return {
      contexto: `Base de conhecimento da empresa (fonte interna, responda com base NESTES trechos e não invente o que não estiver aqui):\n\n${texto}`,
      total: uteis.length
    };
  } catch (e) {
    logger.warn(
      `[${LOG}] base de conhecimento indisponível: ${(e as Error).message}`
    );
    return { contexto: "", total: 0 };
  }
};
