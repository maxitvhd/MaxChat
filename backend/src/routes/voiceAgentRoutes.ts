/**
 * @TercioSantos-0 |
 * routes/voiceAgentRoutes |
 * @descrição: rotas do agente de voz. Todas exigem login: o companyId vem
 *             do token, nunca do corpo da requisição.
 */
import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as VoiceAgentController from "../controllers/VoiceAgentController";

const voiceAgentRoutes = Router();

voiceAgentRoutes.get(
  "/voice-agent/status",
  isAuth,
  VoiceAgentController.situacao
);

voiceAgentRoutes.post(
  "/voice-agent/transcribe",
  isAuth,
  VoiceAgentController.uploadMiddleware,
  VoiceAgentController.transcrever
);

voiceAgentRoutes.post(
  "/voice-agent/turn",
  isAuth,
  VoiceAgentController.uploadMiddleware,
  VoiceAgentController.turno
);

voiceAgentRoutes.post(
  "/voice-agent/confirm",
  isAuth,
  VoiceAgentController.confirmar
);

voiceAgentRoutes.post(
  "/voice-agent/reset",
  isAuth,
  VoiceAgentController.resetar
);

export default voiceAgentRoutes;
