/**
 * @TercioSantos-0 |
 * routes/configurações de IA |
 */
import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as AiProviderSettingsController from "../controllers/AiProviderSettingsController";

const aiProviderSettingsRoutes = Router();

aiProviderSettingsRoutes.get(
  "/aiSettings",
  isAuth,
  AiProviderSettingsController.show
);
aiProviderSettingsRoutes.put(
  "/aiSettings",
  isAuth,
  AiProviderSettingsController.update
);
aiProviderSettingsRoutes.get(
  "/aiSettings/options",
  isAuth,
  AiProviderSettingsController.options
);
aiProviderSettingsRoutes.get(
  "/aiSettings/models",
  isAuth,
  AiProviderSettingsController.models
);
aiProviderSettingsRoutes.post(
  "/aiSettings/test",
  isAuth,
  AiProviderSettingsController.test
);
aiProviderSettingsRoutes.get(
  "/aiSettings/qdrant/collections",
  isAuth,
  AiProviderSettingsController.qdrantCollections
);

export default aiProviderSettingsRoutes;
