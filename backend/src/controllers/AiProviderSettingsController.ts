/**
 * @TercioSantos-0 |
 * controller/AiProviderSettings |
 * @descrição: CRUD das configurações de IA + testes de conexão.
 *              A empresa vem SEMPRE do token (req.user.companyId);
 *              nenhum companyId é aceito do body ou da query.
 */
import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import ShowAiProviderSettingsService, {
  ShowAiProviderSettingsMascarado
} from "../services/AiProviderSettingsServices/ShowAiProviderSettingsService";
import UpdateAiProviderSettingsService from "../services/AiProviderSettingsServices/UpdateAiProviderSettingsService";
import {
  TestAiProviderService,
  AlvoTeste
} from "../services/AiProviderSettingsServices/TestAiProviderService";
import { VOZES_PT_BR } from "../services/AiServices/TtsService";
import {
  AiSettingsLike,
  ReplyEngine,
  RoutingEngine,
  TtsProvider,
  SttProvider
} from "../services/AiServices/types";

/** GET /aiSettings */
export const show = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const data = await ShowAiProviderSettingsMascarado({ companyId });

  return res.status(200).json(data);
};

/** PUT /aiSettings */
export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const data = await UpdateAiProviderSettingsService({
    companyId,
    data: (req.body ?? {}) as Record<string, unknown>
  });

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-aiSettings`, {
    action: "update",
    aiSettings: data
  });

  return res.status(200).json(data);
};

/** GET /aiSettings/options - listas fechadas para montar a tela. */
export const options = async (
  _req: Request,
  res: Response
): Promise<Response> =>
  res.status(200).json({
    replyEngine: Object.values(ReplyEngine),
    routingEngine: Object.values(RoutingEngine),
    ttsProvider: Object.values(TtsProvider),
    sttProvider: Object.values(SttProvider),
    vozesPtBr: VOZES_PT_BR,
    avisoVoz:
      "As vozes do Gemini e do OpenAI são otimizadas para inglês. " +
      "Para português, prefira a nossa API (Piper) ou Azure Speech."
  });

/** GET /aiSettings/models?provider=ollama */
export const models = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const provider = String(req.query.provider ?? "ollama").toLowerCase();

  if (provider !== "ollama") {
    return res.status(400).json({
      error: "A listagem de modelos por URL só está disponível para o Ollama"
    });
  }

  const settings = await ShowAiProviderSettingsService({ companyId });
  const { listarModelosOllama } = await import(
    "../services/AiServices/OllamaService"
  );
  const lista = await listarModelosOllama(
    settings.toJSON() as unknown as AiSettingsLike
  );

  return res.status(200).json({ models: lista });
};

/** GET /aiSettings/qdrant/collections - apenas coleções da própria empresa. */
export const qdrantCollections = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const settings = await ShowAiProviderSettingsService({ companyId });
  const { listarColecoesDaEmpresa } = await import(
    "../services/AiServices/QdrantService"
  );

  const colecoes = await listarColecoesDaEmpresa({
    settings: settings.toJSON() as unknown as AiSettingsLike,
    companyId
  });

  return res.status(200).json({ collections: colecoes });
};

/** POST /aiSettings/test - testa um provider sem persistir nada. */
export const test = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  // aceita "provider" (canônico) e "target" (usado por integrações antigas)
  const corpo = (req.body ?? {}) as {
    provider?: AlvoTeste;
    target?: AlvoTeste;
  };
  const provider = corpo.provider ?? corpo.target;

  const permitidos: AlvoTeste[] = [
    "ollama",
    "openai",
    "gemini",
    "anthropic",
    "tts",
    "stt",
    "jev",
    "laya",
    "qdrant"
  ];

  if (!provider || !permitidos.includes(provider)) {
    return res.status(400).json({
      error: `Provider inválido. Use um destes: ${permitidos.join(", ")}`
    });
  }

  const settings = await ShowAiProviderSettingsService({ companyId });

  try {
    const resultado = await TestAiProviderService(
      provider,
      settings.toJSON() as unknown as AiSettingsLike,
      companyId
    );
    return res.status(200).json(resultado);
  } catch (e) {
    return res.status(200).json({
      ok: false,
      alvo: provider,
      mensagem: (e as Error)?.message ?? "Falha no teste"
    });
  }
};
