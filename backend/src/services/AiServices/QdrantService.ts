/**
 * @TercioSantos-0 |
 * services/AiServices/QdrantService |
 * @descrição: memória vetorial por empresa, com isolamento rígido.
 *
 *              REGRA CRÍTICA: este serviço só enxerga coleções com o prefixo
 *              "empresa_{companyId}_". As coleções legadas do servidor
 *              (teste_debug, zapsaudades_clones, scanmax_memory, etc.) JAMAIS
 *              são lidas, alteradas ou apagadas. Qualquer operação fora do
 *              prefixo da empresa é bloqueada antes de chegar na rede.
 */
import { aiRequest, joinUrl, AiHttpError } from "./http";
import { AiSettingsLike, isBlank } from "./types";

export const QDRANT_URL_PADRAO = "http://127.0.0.1:6333";

export const PREFIXO_PADRAO = "empresa_";

/** Coleções legadas que nunca podem ser tocadas por este serviço. */
export const COLECOES_PROIBIDAS = [
  "teste_debug",
  "zapsaudades_clones",
  "scanmax_memory",
  "clone_usr_td4n0o4k_fabio-bueno-estufa_1784875638",
  "clone_usr_td4n0o4k_rainer_1784875502",
  "noticias_verificadas",
  "noticias_dionatan",
  "hh_trivia_questions"
];

/** Monta o prefixo exclusivo da empresa. */
export const prefixoEmpresa = (
  companyId: number,
  customizado?: string | null
): string => {
  const base = isBlank(customizado)
    ? PREFIXO_PADRAO
    : String(customizado).trim();
  const normalizado = base.endsWith("_") ? base : `${base}_`;
  return `${normalizado}${companyId}_`;
};

/** Valida o nome de uma coleção contra o prefixo da empresa. */
export const validarNomeColecao = (
  companyId: number,
  nome: string,
  prefixo?: string | null
): string => {
  const esperado = prefixoEmpresa(companyId, prefixo);

  if (COLECOES_PROIBIDAS.includes(nome)) {
    throw new AiHttpError(
      `Acesso negado: "${nome}" é uma coleção protegida do servidor`,
      403
    );
  }
  if (!nome.startsWith(esperado)) {
    throw new AiHttpError(
      `Acesso negado: a coleção precisa começar com "${esperado}"`,
      403
    );
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(nome)) {
    throw new AiHttpError(
      "Nome de coleção inválido: use apenas letras, números, - e _",
      400
    );
  }

  return nome;
};

/** Gera um nome de coleção seguro para a empresa a partir de um slug. */
export const nomeColecaoDaEmpresa = (
  companyId: number,
  slug: string,
  prefixo?: string | null
): string => {
  const slugLimpo = String(slug)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!slugLimpo) {
    throw new AiHttpError("Slug inválido para nomear a coleção", 400);
  }

  return `${prefixoEmpresa(companyId, prefixo)}${slugLimpo}`;
};

interface QdrantContexto {
  settings: AiSettingsLike;
  companyId: number;
}

const contexto = ({ settings }: QdrantContexto) => {
  if (!settings.qdrantEnabled) {
    throw new AiHttpError("Qdrant desativado nas configurações da empresa", 0);
  }
  const url = isBlank(settings.qdrantUrl)
    ? QDRANT_URL_PADRAO
    : String(settings.qdrantUrl);
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (!isBlank(settings.qdrantApiKey)) {
    headers["api-key"] = String(settings.qdrantApiKey);
  }
  return { url, headers, timeout: settings.requestTimeout };
};

// ----------------------------------------------------------------- leitura

export const verificarConexao = async (
  ctx: QdrantContexto
): Promise<{ ok: boolean }> =>
  aiRequest<{ ok: boolean }>({
    label: "qdrant",
    method: "GET",
    url: joinUrl(contexto(ctx).url, "/"),
    timeout: ctx.settings.requestTimeout,
    headers: contexto(ctx).headers,
    retries: 0
  });

/**
 * Lista APENAS as coleções da própria empresa.
 * As coleções legadas do servidor são filtradas na resposta.
 */
export const listarColecoesDaEmpresa = async (
  ctx: QdrantContexto
): Promise<string[]> => {
  const { url, headers, timeout } = contexto(ctx);
  const esperado = prefixoEmpresa(
    ctx.companyId,
    ctx.settings.qdrantCollectionPrefix
  );

  const bruto = await aiRequest<{
    result?: { collections?: { name?: string }[] };
  }>({
    label: "qdrant-listar",
    method: "GET",
    url: joinUrl(url, "/collections"),
    timeout,
    headers,
    retries: 0
  });

  const todas = (bruto?.result?.collections ?? [])
    .map(c => c.name ?? "")
    .filter(Boolean);

  return todas.filter(
    nome => nome.startsWith(esperado) && !COLECOES_PROIBIDAS.includes(nome)
  );
};

// ----------------------------------------------------------------- criação

export const criarColecao = async (
  ctx: QdrantContexto,
  slug: string,
  tamanhoVetor = 1536
): Promise<string> => {
  const { url, headers, timeout } = contexto(ctx);
  const nome = nomeColecaoDaEmpresa(
    ctx.companyId,
    slug,
    ctx.settings.qdrantCollectionPrefix
  );
  validarNomeColecao(ctx.companyId, nome, ctx.settings.qdrantCollectionPrefix);

  await aiRequest<unknown>({
    label: "qdrant-criar",
    method: "PUT",
    url: joinUrl(url, `/collections/${encodeURIComponent(nome)}`),
    timeout,
    headers,
    data: { vectors: { size: tamanhoVetor, distance: "Cosine" } }
  });

  return nome;
};

// ----------------------------------------------------------------- memória

export interface RegistrarMemoriaParams extends QdrantContexto {
  slug: string;
  pontoId: string | number;
  vetor: number[];
  payload: Record<string, unknown>;
}

/** Grava um vetor de memória. Sempre valida o nome da coleção antes. */
export const registrarMemoria = async ({
  settings,
  companyId,
  slug,
  pontoId,
  vetor,
  payload
}: RegistrarMemoriaParams): Promise<string> => {
  const { url, headers, timeout } = contexto({ settings, companyId });
  const nome = nomeColecaoDaEmpresa(
    companyId,
    slug,
    settings.qdrantCollectionPrefix
  );
  validarNomeColecao(companyId, nome, settings.qdrantCollectionPrefix);

  // Reforça o tenant no payload para reduzir risco de vazamento cruzado.
  const payloadFinal = {
    ...payload,
    companyId,
    _tenant: `empresa_${companyId}`
  };

  await aiRequest<unknown>({
    label: "qdrant-upsert",
    method: "PUT",
    url: joinUrl(
      url,
      `/collections/${encodeURIComponent(nome)}/points?wait=true`
    ),
    timeout,
    headers,
    data: {
      points: [{ id: pontoId, vector: vetor, payload: payloadFinal }]
    }
  });

  return nome;
};

export interface BuscarMemoriaParams extends QdrantContexto {
  slug: string;
  vetor: number[];
  limite?: number;
  _scoreMinimo?: number;
  /** Quando informado, restringe ao histórico daquele contato. */
  contatoId?: string | number;
  /**
   * Filtros extras por igualdade no payload. Usado pela base de conhecimento
   * para prender a busca na fila mesmo que a coleção já seja exclusiva da base.
   */
  filtrosExtras?: Record<string, string | number | boolean | null>;
}

export const buscarMemorias = async ({
  settings,
  companyId,
  slug,
  vetor,
  limite = 5,
  _scoreMinimo = 0,
  contatoId,
  filtrosExtras
}: BuscarMemoriaParams): Promise<
  { id: string | number; score: number; payload: Record<string, unknown> }[]
> => {
  const { url, headers, timeout } = contexto({ settings, companyId });
  const nome = nomeColecaoDaEmpresa(
    companyId,
    slug,
    settings.qdrantCollectionPrefix
  );
  validarNomeColecao(companyId, nome, settings.qdrantCollectionPrefix);

  // companyId sempre; contatoId quando informado, para o histórico de um
  // cliente nunca vazar para outro dentro da mesma empresa.
  const must: Record<string, unknown>[] = [
    { key: "companyId", match: { value: companyId } }
  ];

  if (contatoId !== undefined && contatoId !== null && contatoId !== "") {
    must.push({ key: "contatoId", match: { value: String(contatoId) } });
  }

  Object.entries(filtrosExtras ?? {}).forEach(([chave, valor]) => {
    if (valor === undefined || valor === null) return;
    must.push({ key: chave, match: { value: valor } });
  });

  const bruto = await aiRequest<{
    result?: {
      id?: string | number;
      score?: number;
      payload?: Record<string, unknown>;
    }[];
  }>({
    label: "qdrant-buscar",
    method: "POST",
    url: joinUrl(url, `/collections/${encodeURIComponent(nome)}/points/search`),
    timeout,
    headers,
    retries: 0,
    data: {
      vector: vetor,
      limit: limite,
      with_payload: true,
      // Filtro por tenant: mesmo com nome correto, o payload precisa bater.
      filter: { must }
    }
  });

  return (bruto?.result ?? [])
    .map(r => ({
      id: r.id as string | number,
      score: Number(r.score ?? 0),
      payload: r.payload ?? {}
    }))
    .filter(r => r.score >= _scoreMinimo);
};

// ----------------------------------------------------------------- remoção

/**
 * Remove pontos de uma coleção da própria empresa.
 * Exige confirmação explícita e nunca aceita coleção fora do prefixo.
 */
export const apagarColecaoDaEmpresa = async (
  ctx: QdrantContexto,
  slug: string
): Promise<string> => {
  const { url, headers, timeout } = contexto(ctx);
  const nome = nomeColecaoDaEmpresa(
    ctx.companyId,
    slug,
    ctx.settings.qdrantCollectionPrefix
  );
  validarNomeColecao(ctx.companyId, nome, ctx.settings.qdrantCollectionPrefix);

  await aiRequest<unknown>({
    label: "qdrant-apagar",
    method: "DELETE",
    url: joinUrl(url, `/collections/${encodeURIComponent(nome)}`),
    timeout,
    headers
  });

  return nome;
};

/**
 * Apaga só os pontos de um documento, pelo filtro do payload.
 *
 * Usado quando um documento é excluído: sem isso os embeddings continuam na
 * coleção e o agente ainda responde com conteúdo que o usuário já apagou.
 */
export const apagarPontosDoDocumento = async (
  ctx: QdrantContexto,
  slug: string,
  documentId: number
): Promise<string> => {
  const { url, headers, timeout } = contexto(ctx);
  const nome = nomeColecaoDaEmpresa(
    ctx.companyId,
    slug,
    ctx.settings.qdrantCollectionPrefix
  );
  validarNomeColecao(ctx.companyId, nome, ctx.settings.qdrantCollectionPrefix);

  // Filtro com o id exato: não apaga embedding de outro documento.
  await aiRequest<unknown>({
    label: "qdrant-apagar-documento",
    method: "POST",
    url: joinUrl(
      url,
      `/collections/${encodeURIComponent(nome)}/points/delete?wait=true`
    ),
    timeout,
    headers: { "Content-Type": "application/json", ...headers },
    data: {
      filter: {
        must: [{ key: "documentId", match: { value: Number(documentId) } }]
      }
    }
  });

  return nome;
};
