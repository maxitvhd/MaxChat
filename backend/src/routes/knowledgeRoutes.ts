/**
 * @TercioSantos-0 |
 * routes/knowledgeRoutes |
 * @descrição: rotas da base de conhecimento. Todas exigem login e leem a
 *             empresa do token, então nenhum endpoint aceita empresa de fora.
 */
import { Router } from "express";
import isAuth from "../middleware/isAuth";
import isAdmin from "../middleware/isAdmin";
import * as KnowledgeController from "../controllers/KnowledgeController";

const knowledgeRoutes = Router();

knowledgeRoutes.get(
  "/knowledge-bases",
  isAuth,
  KnowledgeController.listarBases
);
knowledgeRoutes.post(
  "/knowledge-bases",
  isAuth,
  isAdmin,
  KnowledgeController.criarBase
);
knowledgeRoutes.get(
  "/knowledge-bases/:baseId",
  isAuth,
  KnowledgeController.verBase
);
knowledgeRoutes.put(
  "/knowledge-bases/:baseId",
  isAuth,
  isAdmin,
  KnowledgeController.atualizarBase
);
knowledgeRoutes.delete(
  "/knowledge-bases/:baseId",
  isAuth,
  isAdmin,
  KnowledgeController.excluirBase
);

knowledgeRoutes.get(
  "/knowledge-bases/:baseId/documents",
  isAuth,
  KnowledgeController.listarDocumentos
);
knowledgeRoutes.post(
  "/knowledge-bases/:baseId/documents/upload",
  isAuth,
  KnowledgeController.uploadMiddleware,
  KnowledgeController.enviarArquivo
);
knowledgeRoutes.post(
  "/knowledge-bases/:baseId/documents/texto",
  isAuth,
  isAdmin,
  KnowledgeController.enviarTexto
);
knowledgeRoutes.post(
  "/knowledge-bases/:baseId/documents/url",
  isAuth,
  isAdmin,
  KnowledgeController.enviarUrl
);
knowledgeRoutes.post(
  "/knowledge-bases/:baseId/reindex",
  isAuth,
  isAdmin,
  KnowledgeController.reindexarBase
);
knowledgeRoutes.post(
  "/knowledge-bases/:baseId/search",
  isAuth,
  KnowledgeController.testarBusca
);

knowledgeRoutes.delete(
  "/knowledge-documents/:documentId",
  isAuth,
  isAdmin,
  KnowledgeController.excluirDocumento
);

export default knowledgeRoutes;
