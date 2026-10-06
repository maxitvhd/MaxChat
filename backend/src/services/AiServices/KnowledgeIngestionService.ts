/**
 * @TercioSantos-0 |
 * services/AiServices/KnowledgeIngestionService |
 * @descrição: extrai, quebra e indexa documentos de uma base de conhecimento.
 *
 *              Aceita texto colado, arquivo (.md/.txt/.pdf) e URL. Cada base tem
 *              uma coleção própria no Qdrant, nomeada a partir do slug pelo
 *              nomeColecaoDaEmpresa, o que já garante o isolamento por empresa.
 *              Além disso, todo ponto gravado carrega companyId, baseId e
 *              queueId no payload, e a busca filtra por esses campos.
 */
import dns from "dns";
import { createHash } from "crypto";
import net from "net";
import KnowledgeDocument from "../../models/KnowledgeDocument";
import { AiHttpError } from "./http";
import { AiSettingsLike } from "./types";
import { gerarEmbedding } from "./OllamaService";
import {
  criarColecao,
  buscarMemorias,
  nomeColecaoDaEmpresa,
  registrarMemoria,
  apagarColecaoDaEmpresa
} from "./QdrantService";
import logger from "../../utils/logger";

/** Carregamento tardio: pdf-parse e cheerio só entram em memória quando usados. */
const carregarModulo = <T>(nome: string): T => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(nome);
    return ((mod as { default?: unknown }).default ?? mod) as T;
  } catch (erro) {
    throw new AiHttpError(
      `Dependência "${nome}" não está disponível: ${(erro as Error).message}`,
      400
    );
  }
};

export const TAMANHO_MINIMO_TEXTO = 30;

export interface TextoExtraido {
  texto: string;
  titulo: string;
}

/** Normaliza quebras de linha e espaços excessivos vindos de PDF/HTML. */
const normalizar = (bruto: string): string =>
  String(bruto ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map(linha => linha.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim();

/**
 * Extrai o texto de um PDF com o build legacy do pdfjs-dist.
 *
 * Não usamos o pacote "pdf-parse" porque ele embute um pdf.js de 2018, que
 * falha com "bad XRef entry" em PDFs modernos (xref stream). O build legacy
 * roda em Node, sem browser, e é o mesmo código usado no navegador.
 */
export const extrairPdf = async (buffer: Buffer): Promise<string> => {
  // O build legacy do pdfjs-dist não expõe tipos utilizáveis para consumo
  // direto em Node (TextItem vs TextMarkedContent), então o contrato fica
  // declarado aqui de forma mínima e explícita.
  type PaginaPdf = {
    getTextContent: () => Promise<{
      items: Array<{ str?: string; hasEOL?: boolean }>;
    }>;
  };
  type DocumentoPdf = {
    numPages: number;
    getPage: (numero: number) => Promise<PaginaPdf>;
    destroy: () => Promise<void>;
  };
  type Pdfjs = {
    getDocument: (opcoes: { data: Uint8Array; useSystemFonts: boolean }) => {
      promise: Promise<DocumentoPdf>;
    };
  };

  let pdfjs: Pdfjs;
  try {
    const modulo = (await import(
      "pdfjs-dist/legacy/build/pdf.mjs"
    )) as unknown as { default?: Pdfjs } & Pdfjs;
    pdfjs = modulo.default ?? modulo;
  } catch (erro) {
    throw new AiHttpError(
      `Não foi possível carregar o leitor de PDF: ${(erro as Error).message}`,
      400
    );
  }

  const documento = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true
  }).promise;

  try {
    const paginas: string[] = [];

    for (let numero = 1; numero <= documento.numPages; numero += 1) {
      const pagina = await documento.getPage(numero);
      const conteudo = await pagina.getTextContent();
      paginas.push(
        conteudo.items
          .map(item => `${item.str ?? ""}${item.hasEOL ? "\n" : " "}`)
          .join("")
      );
    }

    return paginas.join("\n\n");
  } finally {
    await documento.destroy().catch(() => undefined);
  }
};

const tituloDeUrl = (url: string): string => {
  try {
    const caminho = new URL(url).pathname;
    const ultimo = caminho.split("/").filter(Boolean).pop() ?? "";
    if (!ultimo) return new URL(url).hostname;
    return (
      decodeURIComponent(ultimo).replace(/\.[a-z0-9]+$/i, "") ||
      new URL(url).hostname
    );
  } catch {
    return "Documento";
  }
};

// ------------------------------------------------------------------ extração

/**
 * Extrai texto de arquivo enviado pelo painel.
 * `mimetype` e o nome definem o extrator; PDF usa pdf-parse.
 */
export const extrairDeArquivo = async (
  buffer: Buffer,
  nomeOriginal: string,
  mimetype?: string
): Promise<TextoExtraido> => {
  const nome = String(nomeOriginal ?? "");
  const mime = String(mimetype ?? "").toLowerCase();
  const ehPdf = mime === "application/pdf" || /\.pdf$/i.test(nome);

  let texto: string;

  if (ehPdf) {
    texto = await extrairPdf(buffer);
  } else if (
    mime.startsWith("text/") ||
    /\.(txt|md|markdown|csv|json)$/i.test(nome)
  ) {
    texto = buffer.toString("utf8");
  } else {
    throw new AiHttpError(
      `Formato não suportado: ${mime || nome}. Envie .md, .txt ou .pdf`,
      400
    );
  }

  const limpo = normalizar(texto);
  if (limpo.length < TAMANHO_MINIMO_TEXTO) {
    throw new AiHttpError(
      "O documento veio praticamente vazio. Confira se o arquivo tem conteúdo.",
      400
    );
  }

  const titulo =
    nome
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_-]+/g, " ")
      .trim() || "Documento";

  return { texto: limpo, titulo };
};

/** Bloqueia alvos internos para a ingestion por URL não virar SSRF. */
const hostEhPrivado = (host: string): boolean => {
  const alvo = host.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    alvo === "localhost" ||
    alvo.endsWith(".local") ||
    alvo.endsWith(".internal")
  ) {
    return true;
  }

  const tipo = net.isIP(alvo);
  if (tipo === 4) {
    const [a, b] = alvo.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    );
  }
  if (tipo === 6) {
    return (
      alvo === "::1" ||
      alvo.startsWith("fc") ||
      alvo.startsWith("fd") ||
      alvo.startsWith("fe80")
    );
  }
  return false;
};

/**
 * Baixa uma URL pública e devolve o texto útil da página.
 * Só http/https, resolve o host e recusa rede interna.
 */
export const extrairDeUrl = async (
  urlBruta: string
): Promise<TextoExtraido> => {
  let alvo: URL;
  try {
    alvo = new URL(String(urlBruta).trim());
  } catch {
    throw new AiHttpError("URL inválida", 400);
  }

  if (!["http:", "https:"].includes(alvo.protocol)) {
    throw new AiHttpError("A URL precisa começar com http:// ou https://", 400);
  }
  if (hostEhPrivado(alvo.hostname)) {
    throw new AiHttpError(
      "URL bloqueada: endereços internos não podem ser usados como fonte",
      400
    );
  }

  const resolvidos = await dns.promises.lookup(alvo.hostname, { all: true });
  if (resolvidos.some(r => hostEhPrivado(r.address))) {
    throw new AiHttpError(
      "URL bloqueada: o domínio aponta para a rede interna",
      400
    );
  }

  const resposta = await fetch(alvo.toString(), {
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": "MaxChat-BaseConhecimento/1.0" }
  });

  if (!resposta.ok) {
    throw new AiHttpError(
      `Não foi possível ler a URL (HTTP ${resposta.status})`,
      400
    );
  }
  if (!resposta.headers.get("content-type")?.includes("text/html")) {
    throw new AiHttpError(
      "A URL não devolveu uma página HTML. Envie o link de uma página.",
      400
    );
  }

  // Segue o redirecionamento final para revalidar o destino.
  if (hostEhPrivado(new URL(resposta.url).hostname)) {
    throw new AiHttpError("URL bloqueada após redirecionamento", 400);
  }

  const html = await resposta.text();
  const cheerio = carregarModulo<{
    load: (html: string) => any;
  }>("cheerio");
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe, svg").remove();
  const texto = normalizar($("body").text());

  if (texto.length < TAMANHO_MINIMO_TEXTO) {
    throw new AiHttpError("A página veio sem texto aproveitável", 400);
  }

  const titulo = normalizar($("title").text()) || tituloDeUrl(resposta.url);
  return { texto, titulo };
};

// ------------------------------------------------------------------ chunking

export interface Chunk {
  indice: number;
  texto: string;
}

/**
 * Quebra o texto em blocos. Prefere cortar em títulos e parágrafos, e só usa
 * sobreposição quando o bloco é grande demais para caber no tamanho pedido.
 */
export const quebrarEmChunks = (
  texto: string,
  tamanho = 900,
  sobreposicao = 150
): Chunk[] => {
  const limpo = normalizar(texto);
  if (limpo.length <= tamanho) {
    return [{ indice: 0, texto: limpo }];
  }

  // 1) tentar preservar blocos MD (títulos, listas, parágrafos).
  const paragrafos = limpo.split(/\n{2,}/).filter(p => p.trim().length > 0);
  const blocos: string[] = [];
  let atual = "";

  paragrafos.forEach(paragrafo => {
    if (atual.length + paragrafo.length + 2 <= tamanho) {
      atual = atual ? `${atual}\n\n${paragrafo}` : paragrafo;
      return;
    }
    if (atual) blocos.push(atual);
    // Bloco único maior que o tamanho: divide em pedaços com sobreposição.
    if (paragrafo.length > tamanho) {
      const passo = Math.max(1, tamanho - Math.min(sobreposicao, tamanho - 1));
      for (let i = 0; i < paragrafo.length; i += passo) {
        blocos.push(paragrafo.slice(i, i + tamanho));
        if (i + tamanho >= paragrafo.length) break;
      }
      atual = "";
      return;
    }
    atual = paragrafo;
  });
  if (atual) blocos.push(atual);

  return blocos
    .map(b => b.trim())
    .filter(b => b.length >= 10)
    .map((textoBloco, indice) => ({ indice, texto: textoBloco }));
};

// ------------------------------------------------------------------ indexação

/**
 * Qdrant só aceita inteiro unsigned ou UUID como id de ponto: string livre
 * volta 400 ("value X is not a valid point ID"). Um id estável por
 * documento+chunk faz o reindexamento sobrescrever no lugar, em vez de
 * duplicar pontos a cada reprocessamento.
 */
export const idPonto = (documentoId: number, chunkIndex: number): string => {
  const hex = createHash("sha256")
    .update(`conhecimento:${documentoId}:${chunkIndex}`)
    .digest("hex");

  // Formata como UUID e marca a versão 5 (name-based, derivado do hash).
  const uuid = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    ((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16) +
      hex.slice(17, 20),
    hex.slice(20, 32)
  ].join("-");

  return uuid;
};

export interface IndexarParams {
  settings: AiSettingsLike;
  companyId: number;
  base: {
    id: number;
    slug: string;
    queueId: number | null;
    chunkSize: number;
    chunkOverlap: number;
  };
  documento: KnowledgeDocument;
}

/**
 * Vetoriza um documento já com texto e grava os pontos na coleção da base.
 * Cria a coleção se ainda não existir. Não apaga nada de outras bases.
 */
export const indexarDocumento = async ({
  settings,
  companyId,
  base,
  documento
}: IndexarParams): Promise<number> => {
  const texto = normalizar(documento.rawText ?? "");
  if (texto.length < TAMANHO_MINIMO_TEXTO) {
    throw new AiHttpError("Documento sem texto suficiente para indexar", 400);
  }

  const chunks = quebrarEmChunks(texto, base.chunkSize, base.chunkOverlap);

  // O primeiro embedding define a dimensão da coleção. Passar um tamanho
  // fixo quebra o upsert: o Qdrant rejeita vetor de outra dimensão.
  const primeiro = await gerarEmbedding(settings, chunks[0].texto);

  try {
    await criarColecao({ settings, companyId }, base.slug, primeiro.length);
  } catch (erro) {
    // 409 = a coleção já existe, que é o caminho normal ao reindexar ou
    // adicionar um segundo documento na mesma base.
    const jaExiste =
      erro instanceof AiHttpError &&
      (erro.status === 409 || /already exists|conflict/i.test(erro.message));
    if (!jaExiste) throw erro;
  }

  for (const chunk of chunks) {
    const vetor =
      chunk.indice === 0
        ? primeiro
        : await gerarEmbedding(settings, chunk.texto);

    await registrarMemoria({
      settings,
      companyId,
      slug: base.slug,
      // Id estável: reindexar sobrescreve em vez de duplicar.
      pontoId: idPonto(documento.id, chunk.indice),
      vetor,
      payload: {
        companyId,
        baseId: base.id,
        queueId: base.queueId ?? null,
        documentId: documento.id,
        title: documento.title,
        kind: documento.kind,
        sourceUrl: documento.sourceUrl ?? null,
        chunkIndex: chunk.indice,
        text: chunk.texto
      }
    });
  }

  return chunks.length;
};

/** Busca na base, já filtrando empresa e fila. */
export const buscarNaBase = async ({
  settings,
  companyId,
  base,
  consulta,
  limite = 4
}: {
  settings: AiSettingsLike;
  companyId: number;
  base: {
    slug: string;
    queueId: number | null;
    minScore: number;
  };
  consulta: string;
  limite?: number;
}): Promise<{ score: number; payload: Record<string, unknown> }[]> => {
  const vetor = await gerarEmbedding(settings, consulta);

  return buscarMemorias({
    settings,
    companyId,
    slug: base.slug,
    vetor,
    limite,
    _scoreMinimo: base.minScore,
    filtrosExtras: base.queueId ? { queueId: base.queueId } : undefined
  });
};

/** Nome da coleção de uma base, para exibir na tela. */
export const colecaoDaBase = (
  companyId: number,
  slug: string,
  prefixo?: string | null
): string => nomeColecaoDaEmpresa(companyId, slug, prefixo);

/**
 * Reaponta os embeddings de uma base depois que o slug (nome) mudou.
 *
 * O slug é o nome da coleção no Qdrant, e Qdrant não renomeia coleção. Como o
 * texto bruto fica salvo no banco, a saída mais honesta é descartar a coleção
 * antiga e reindexar os documentos para o slug novo. Sem isso, a base ficaria
 * vazia para o agente sem nenhum aviso.
 */
export const reapontarBase = async (ctx: {
  settings: AiSettingsLike;
  companyId: number;
  base: {
    id: number;
    slug: string;
    queueId: number | null;
    chunkSize: number;
    chunkOverlap: number;
  };
  slugAnterior: string;
}): Promise<number> => {
  const { settings, companyId, base, slugAnterior } = ctx;

  const qdrant = settings as unknown as { qdrantEnabled?: boolean };
  if (!qdrant.qdrantEnabled) return 0;

  // A coleção antiga vira lixo: ninguém mais consulta por aquele slug.
  try {
    await apagarColecaoDaEmpresa({ settings, companyId }, slugAnterior);
  } catch (erro) {
    logger.warn(
      `[Knowledge] coleção antiga ${slugAnterior} não removida: ${
        (erro as Error).message
      }`
    );
  }

  const documentos = await KnowledgeDocument.findAll({
    where: { baseId: base.id, companyId }
  });

  let prontos = 0;
  for (const documento of documentos) {
    documento.status = "indexando";
    await documento.save();
    try {
      const chunkCount = await indexarDocumento({
        settings,
        companyId,
        base: {
          id: base.id,
          slug: base.slug,
          queueId: base.queueId,
          chunkSize: base.chunkSize,
          chunkOverlap: base.chunkOverlap
        },
        documento
      });
      documento.status = "pronto";
      documento.chunkCount = chunkCount;
      documento.errorMessage = null;
      await documento.save();
      prontos += 1;
    } catch (erro) {
      documento.status = "erro";
      documento.errorMessage = (erro as Error).message;
      await documento.save();
    }
  }

  return prontos;
};
