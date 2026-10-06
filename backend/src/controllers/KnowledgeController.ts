/**
 * @TercioSantos-0 |
 * controllers/KnowledgeController |
 * @descrição: CRUD da base de conhecimento por empresa, ingestão de
 *             documentos (arquivo, texto e URL) e teste de busca.
 *
 *             companyId vem SEMPRE do token, nunca do body: é o que impede
 *             uma empresa de escrever na base de outra. O upload usa
 *             armazenamento em memória, então o arquivo do cliente não vira
 *             arquivo público no disco.
 */
import { Request, Response } from "express";
import multer from "multer";
import { verify } from "jsonwebtoken";
import authConfig from "../config/auth";
import KnowledgeBase from "../models/KnowledgeBase";
import KnowledgeDocument from "../models/KnowledgeDocument";
import Queue from "../models/Queue";
import logger from "../utils/logger";
import { AiHttpError } from "../services/AiServices/http";
import ShowAiProviderSettingsService from "../services/AiProviderSettingsServices/ShowAiProviderSettingsService";
import { AiSettingsLike } from "../services/AiServices/types";
import {
  buscarNaBase,
  extrairDeArquivo,
  extrairDeUrl,
  indexarDocumento,
  reapontarBase
} from "../services/AiServices/KnowledgeIngestionService";
import {
  apagarColecaoDaEmpresa,
  apagarPontosDoDocumento
} from "../services/AiServices/QdrantService";

interface TokenPayload {
  id: string;
  companyId: number;
}

const EMPRESA_DO_TOKEN = (req: Request): number => {
  const authHeader = req.headers.authorization;
  const [, token] = String(authHeader ?? "").split(" ");
  const decoded = verify(token, authConfig.secret) as TokenPayload;
  return Number(decoded.companyId);
};

/** Documentos ficam só em memória: some depois do processamento. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const aceito =
      /text\/(plain|markdown|csv)/.test(file.mimetype) ||
      file.mimetype === "application/pdf" ||
      /\.(md|txt|pdf|markdown|csv)$/i.test(file.originalname);

    // A tipagem do multer declara o primeiro argumento como null, mas em
    // runtime ele aceita Error; o cast fica isolado neste ponto.
    const done = cb as unknown as (erro: unknown, aceitar: boolean) => void;

    if (aceito) {
      done(null, true);
      return;
    }
    done(new AiHttpError("Envie .md, .txt ou .pdf", 400), false);
  }
});

const statusDoErro = (erro: Error): number =>
  erro instanceof AiHttpError ? erro.status || 500 : 500;

const tratarErro = (erro: Error, res: Response): Response =>
  res.status(statusDoErro(erro)).json({ error: erro.message });

const slugDe = (nome: string): string =>
  String(nome)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "base";

// ------------------------------------------------------------------- bases

export const listarBases = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const companyId = EMPRESA_DO_TOKEN(req);
    const bases = await KnowledgeBase.findAll({
      where: { companyId },
      include: [{ model: Queue, as: "queue", attributes: ["id", "name"] }],
      order: [["id", "DESC"]]
    });
    return res.status(200).json({ bases });
  } catch (erro) {
    return tratarErro(erro as Error, res);
  }
};

export const criarBase = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const companyId = EMPRESA_DO_TOKEN(req);
    const { name, description, queueId } = req.body ?? {};

    if (!name?.trim()) {
      throw new AiHttpError("Dê um nome para a base", 400);
    }

    const fila = queueId
      ? await Queue.findOne({ where: { id: queueId, companyId } })
      : null;
    if (queueId && !fila) {
      throw new AiHttpError("Fila não pertence a esta empresa", 400);
    }

    const base = await KnowledgeBase.create({
      companyId,
      name: name.trim(),
      slug: slugDe(name),
      description: description?.trim() || null,
      queueId: fila?.id ?? null,
      createdByUserId: Number(req.body?.createdByUserId) || null
    });

    return res.status(200).json(base);
  } catch (erro) {
    return tratarErro(erro as Error, res);
  }
};

export const verBase = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const companyId = EMPRESA_DO_TOKEN(req);
    const { baseId } = req.params;

    const base = await KnowledgeBase.findOne({
      where: { id: baseId, companyId },
      include: [
        { model: Queue, as: "queue", attributes: ["id", "name"] },
        {
          model: KnowledgeDocument,
          as: "documents",
          attributes: [
            "id",
            "title",
            "kind",
            "fileName",
            "sourceUrl",
            "sizeBytes",
            "status",
            "chunkCount",
            "errorMessage",
            "createdAt",
            "updatedAt"
          ]
        }
      ]
    });

    if (!base) throw new AiHttpError("Base não encontrada", 404);
    return res.status(200).json(base);
  } catch (erro) {
    return tratarErro(erro as Error, res);
  }
};

export const atualizarBase = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const companyId = EMPRESA_DO_TOKEN(req);
    const { baseId } = req.params;
    const { name, description, queueId, active, minScore } = req.body ?? {};

    const base = await KnowledgeBase.findOne({
      where: { id: baseId, companyId }
    });
    if (!base) throw new AiHttpError("Base não encontrada", 404);

    if (queueId !== undefined) {
      const fila = await Queue.findOne({ where: { id: queueId, companyId } });
      if (queueId && !fila) {
        throw new AiHttpError("Fila não pertence a esta empresa", 400);
      }
      base.queueId = fila?.id ?? null;
    }
    let slugMudou = false;
    const slugAntes = base.slug;
    if (name?.trim()) {
      const novoSlug = slugDe(name);
      slugMudou = novoSlug !== base.slug;
      base.name = name.trim();
      base.slug = novoSlug;
    }
    if (description !== undefined)
      base.description = description?.trim() || null;
    if (active !== undefined) base.active = Boolean(active);
    if (minScore !== undefined) base.minScore = Number(minScore);

    await base.save();

    // O slug é o nome da coleção no Qdrant. Trocar o nome da base deixaria a
    // coleção antiga órfã e a nova, vazia: o agente pararia de achar o
    // conteúdo sem nenhum aviso. Leva os pontos junto.
    if (slugMudou) {
      try {
        const settings = (
          await ShowAiProviderSettingsService({ companyId })
        ).toJSON() as unknown as AiSettingsLike;
        const prontos = await reapontarBase({
          settings,
          companyId,
          base: {
            id: base.id,
            slug: base.slug,
            queueId: base.queueId,
            chunkSize: base.chunkSize,
            chunkOverlap: base.chunkOverlap
          },
          slugAnterior: slugAntes
        });
        if (prontos > 0) {
          return res.status(200).json({
            ...base.toJSON(),
            aviso: `Base renomeada e ${prontos} documento(s) reindexado(s).`
          });
        }
      } catch (erro) {
        logger.error(
          `[Knowledge] falha ao renomear coleção da base ${base.id}: ${
            (erro as Error).message
          }`
        );
        return res.status(200).json({
          ...base.toJSON(),
          aviso:
            "Nome atualizado, mas a base vetorial não pôde ser renomeada. Reindexe a base para o agente voltar a encontrar o conteúdo."
        });
      }
    }

    return res.status(200).json(base);
  } catch (erro) {
    return tratarErro(erro as Error, res);
  }
};

export const excluirBase = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const companyId = EMPRESA_DO_TOKEN(req);
    const { baseId } = req.params;

    const base = await KnowledgeBase.findOne({
      where: { id: baseId, companyId }
    });
    if (!base) throw new AiHttpError("Base não encontrada", 404);

    // Apaga a coleção vetorial junto. Sem isso, os trechos continuariam
    // encontráveis por busca mesmo com a base removida do banco.
    try {
      const settings = (
        await ShowAiProviderSettingsService({ companyId })
      ).toJSON() as unknown as AiSettingsLike;
      await apagarColecaoDaEmpresa({ settings, companyId }, base.slug);
    } catch {
      // Qdrant fora do ar não pode impedir a exclusão no banco.
    }

    await base.destroy();
    return res.status(200).json({ ok: true });
  } catch (erro) {
    return tratarErro(erro as Error, res);
  }
};

// -------------------------------------------------------------- documentos

/** Cria o documento, indexa e devolve o estado final. */
const registrarEIndexar = async ({
  base,
  companyId,
  settings,
  titulo,
  kind,
  texto,
  fileName,
  sourceUrl,
  sizeBytes
}: {
  base: KnowledgeBase;
  companyId: number;
  settings: any;
  titulo: string;
  kind: string;
  texto: string;
  fileName?: string;
  sourceUrl?: string;
  sizeBytes?: number;
}) => {
  const documento = await KnowledgeDocument.create({
    baseId: base.id,
    companyId,
    title: titulo,
    kind,
    fileName: fileName ?? null,
    sourceUrl: sourceUrl ?? null,
    sizeBytes: sizeBytes ?? texto.length,
    rawText: texto,
    status: "indexando"
  });

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
  } catch (erro) {
    // Documento guardado com o erro: a tela mostra o motivo e permite reindexar.
    documento.status = "erro";
    documento.errorMessage = (erro as Error).message;
  }

  await documento.save();
  return documento;
};

export const listarDocumentos = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const companyId = EMPRESA_DO_TOKEN(req);
    const { baseId } = req.params;

    const base = await KnowledgeBase.findOne({
      where: { id: baseId, companyId }
    });
    if (!base) throw new AiHttpError("Base não encontrada", 404);

    const documentos = await KnowledgeDocument.findAll({
      where: { baseId: base.id, companyId },
      attributes: [
        "id",
        "title",
        "kind",
        "fileName",
        "sourceUrl",
        "sizeBytes",
        "status",
        "chunkCount",
        "errorMessage",
        "createdAt",
        "updatedAt"
      ],
      order: [["id", "DESC"]]
    });

    return res.status(200).json({ documentos });
  } catch (erro) {
    return tratarErro(erro as Error, res);
  }
};

export const enviarArquivo = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const companyId = EMPRESA_DO_TOKEN(req);
    const { baseId } = req.params;
    const arquivo = req.file;

    if (!arquivo) throw new AiHttpError("Nenhum arquivo enviado", 400);

    const base = await KnowledgeBase.findOne({
      where: { id: baseId, companyId }
    });
    if (!base) throw new AiHttpError("Base não encontrada", 404);

    const settings = (
      await ShowAiProviderSettingsService({ companyId })
    ).toJSON() as unknown as AiSettingsLike;
    const { texto, titulo } = await extrairDeArquivo(
      arquivo.buffer,
      arquivo.originalname,
      arquivo.mimetype
    );

    const documento = await registrarEIndexar({
      base,
      companyId,
      settings,
      titulo: req.body?.title?.trim() || titulo,
      kind: /\.pdf$/i.test(arquivo.originalname)
        ? "pdf"
        : /\.md$/i.test(arquivo.originalname)
        ? "md"
        : "txt",
      texto,
      fileName: arquivo.originalname,
      sizeBytes: arquivo.size
    });

    return res.status(200).json(documento);
  } catch (erro) {
    return tratarErro(erro as Error, res);
  }
};

export const enviarTexto = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const companyId = EMPRESA_DO_TOKEN(req);
    const { baseId } = req.params;
    const { title, content } = req.body ?? {};

    if (!content?.trim()) throw new AiHttpError("O texto está vazio", 400);

    const base = await KnowledgeBase.findOne({
      where: { id: baseId, companyId }
    });
    if (!base) throw new AiHttpError("Base não encontrada", 404);

    const settings = (
      await ShowAiProviderSettingsService({ companyId })
    ).toJSON() as unknown as AiSettingsLike;

    const documento = await registrarEIndexar({
      base,
      companyId,
      settings,
      titulo: title?.trim() || "Texto colado",
      kind: "texto",
      texto: content.trim(),
      sizeBytes: content.trim().length
    });

    return res.status(200).json(documento);
  } catch (erro) {
    return tratarErro(erro as Error, res);
  }
};

export const enviarUrl = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const companyId = EMPRESA_DO_TOKEN(req);
    const { baseId } = req.params;
    const { url } = req.body ?? {};

    if (!url?.trim()) throw new AiHttpError("Informe a URL", 400);

    const base = await KnowledgeBase.findOne({
      where: { id: baseId, companyId }
    });
    if (!base) throw new AiHttpError("Base não encontrada", 404);

    const settings = (
      await ShowAiProviderSettingsService({ companyId })
    ).toJSON() as unknown as AiSettingsLike;
    const { texto, titulo } = await extrairDeUrl(url);

    const documento = await registrarEIndexar({
      base,
      companyId,
      settings,
      titulo: req.body?.title?.trim() || titulo,
      kind: "url",
      texto,
      sourceUrl: url.trim(),
      sizeBytes: texto.length
    });

    return res.status(200).json(documento);
  } catch (erro) {
    return tratarErro(erro as Error, res);
  }
};

export const excluirDocumento = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const companyId = EMPRESA_DO_TOKEN(req);
    const { documentId } = req.params;

    const documento = await KnowledgeDocument.findOne({
      where: { id: documentId, companyId },
      include: [{ model: KnowledgeBase, as: "base" }]
    });
    if (!documento) throw new AiHttpError("Documento não encontrado", 404);

    // Tira os embeddings antes do registro: se o Qdrant estiver fora, é
    // melhor devolver erro e manter o documento do que apagar o texto e
    // deixar o agente ainda citando o conteúdo.
    const base = documento.get("base") as KnowledgeBase | undefined;
    if (base) {
      const settings = await ShowAiProviderSettingsService({ companyId });
      const qdrant = settings.toJSON() as unknown as AiSettingsLike;
      if (qdrant.qdrantEnabled) {
        await apagarPontosDoDocumento(
          { settings: qdrant, companyId },
          base.slug,
          documento.id
        );
      }
    }

    await documento.destroy();
    return res.status(200).json({ ok: true });
  } catch (erro) {
    return tratarErro(erro as Error, res);
  }
};

/** Reindexa a partir do texto já guardado, sem reenviar o arquivo. */
export const reindexarBase = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const companyId = EMPRESA_DO_TOKEN(req);
    const { baseId } = req.params;

    const base = await KnowledgeBase.findOne({
      where: { id: baseId, companyId }
    });
    if (!base) throw new AiHttpError("Base não encontrada", 404);

    const settings = (
      await ShowAiProviderSettingsService({ companyId })
    ).toJSON() as unknown as AiSettingsLike;
    const documentos = await KnowledgeDocument.findAll({
      where: { baseId: base.id, companyId }
    });

    let prontos = 0;
    let comErro = 0;

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
        prontos += 1;
      } catch (erro) {
        documento.status = "erro";
        documento.errorMessage = (erro as Error).message;
        comErro += 1;
      }

      await documento.save();
    }

    return res.status(200).json({ prontos, comErro, total: documentos.length });
  } catch (erro) {
    return tratarErro(erro as Error, res);
  }
};

// ------------------------------------------------------------------ busca

export const testarBusca = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const companyId = EMPRESA_DO_TOKEN(req);
    const { baseId } = req.params;
    const { query } = req.body ?? {};

    if (!query?.trim()) throw new AiHttpError("Escreva o que quer buscar", 400);

    const base = await KnowledgeBase.findOne({
      where: { id: baseId, companyId }
    });
    if (!base) throw new AiHttpError("Base não encontrada", 404);

    const settings = (
      await ShowAiProviderSettingsService({ companyId })
    ).toJSON() as unknown as AiSettingsLike;
    const achados = await buscarNaBase({
      settings,
      companyId,
      base: {
        slug: base.slug,
        queueId: base.queueId,
        minScore: Number(base.minScore ?? 0.45)
      },
      consulta: query.trim(),
      limite: 8
    });

    return res.status(200).json({
      resultados: achados.map(a => ({
        score: Number(a.score?.toFixed?.(4) ?? a.score),
        titulo: a.payload?.title,
        texto: a.payload?.text,
        fonte: a.payload?.sourceUrl ?? a.payload?.fileName ?? null,
        documentoId: a.payload?.documentId
      }))
    });
  } catch (erro) {
    return tratarErro(erro as Error, res);
  }
};

export const uploadMiddleware = upload.single("file");
