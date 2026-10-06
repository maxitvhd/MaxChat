/**
 * @TercioSantos-0 |
 * controllers/VoiceAgentController |
 * @descrição: endpoints do agente de voz do painel.
 *
 *             companyId e userId saem SEMPRE do token. O áudio gravado pelo
 *             navegador (webm/opus) é convertido para WAV 16kHz antes do STT,
 *             o mesmo formato que o Whisper do WhatsApp consome.
 */
import fs from "fs";
import { Request, Response } from "express";
import multer from "multer";
import { verify } from "jsonwebtoken";
import authConfig from "../config/auth";
import { AiHttpError } from "../services/AiServices/http";
import { AiSettingsLike } from "../services/AiServices/types";
import ShowAiProviderSettingsService from "../services/AiProviderSettingsServices/ShowAiProviderSettingsService";
import { transcreverAudio } from "../services/AiServices/SttService";
import { converterParaWav } from "../services/AiServices/SttFromWhatsAppService";
import { gerarAudio } from "../services/AiServices/TtsService";
import {
  limparHistorico,
  processarTurno,
  RespostaAgente
} from "../services/AiServices/VoiceAgentService";
import {
  confirmarAcao,
  ContextoAgente,
  limparPendentesDoUsuario
} from "../services/AiServices/VoiceAgentTools";

interface TokenPayload {
  id: string;
  profile: string;
  companyId: number;
}

const IDENTIDADE = (req: Request): TokenPayload => {
  const authHeader = req.headers.authorization;
  const [, token] = String(authHeader ?? "").split(" ");
  return verify(token, authConfig.secret) as TokenPayload;
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

const statusDoErro = (erro: Error): number =>
  erro instanceof AiHttpError ? erro.status || 500 : 500;

const responder = (erro: Error, res: Response): Response =>
  res.status(statusDoErro(erro)).json({ error: erro.message });

/** Carrega as configurações já no formato que os serviços de IA esperam. */
const settingsDaEmpresa = async (companyId: number): Promise<AiSettingsLike> =>
  (
    await ShowAiProviderSettingsService({ companyId })
  ).toJSON() as unknown as AiSettingsLike;

const contexto = (
  identidade: TokenPayload,
  settings: AiSettingsLike
): ContextoAgente => {
  const permissao = String(
    (settings as { voiceAgentPermission?: string }).voiceAgentPermission ??
      "admin"
  ).toLowerCase();

  return {
    companyId: Number(identidade.companyId),
    userId: Number(identidade.id),
    podeEscrever:
      permissao === "all"
        ? true
        : String(identidade.profile).toLowerCase() === "admin"
  };
};

/** Situação do módulo, para o painel mostrar ou esconder o botão de voz. */
export const situacao = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const identidade = IDENTIDADE(req);
    const settings = await settingsDaEmpresa(Number(identidade.companyId));
    const ctx = contexto(identidade, settings);

    const modelo = String(
      (settings as { voiceAgentModel?: string }).voiceAgentModel ?? ""
    ).trim();
    const enabled = Boolean(
      (settings as { voiceAgentEnabled?: boolean }).voiceAgentEnabled
    );

    return res.status(200).json({
      enabled,
      modelo,
      // Com o agente desligado ninguem escreve por ele, mesmo admin.
      podeEscrever: enabled && ctx.podeEscrever,
      possuiVoz: Boolean((settings as { ttsProvider?: string }).ttsProvider)
    });
  } catch (erro) {
    return responder(erro as Error, res);
  }
};

/** Transcreve o áudio do microfone e devolve só o texto. */
export const transcrever = async (
  req: Request,
  res: Response
): Promise<Response> => {
  let convertido: { arquivo: string; limpar: () => void } | null = null;

  try {
    const identidade = IDENTIDADE(req);
    const arquivo = req.file;
    if (!arquivo?.buffer?.length) throw new AiHttpError("Áudio vazio", 400);

    const settings = await settingsDaEmpresa(Number(identidade.companyId));

    // MediaRecorder entrega webm/opus; o STT quer WAV 16kHz mono.
    convertido = await converterParaWav(arquivo.buffer, arquivo.mimetype);

    const texto = await transcreverAudio({
      settings,
      audio: fs.readFileSync(convertido.arquivo),
      nomeArquivo: "agente.wav",
      mimeType: "audio/wav",
      idioma: "pt"
    });

    return res.status(200).json({ texto });
  } catch (erro) {
    return responder(erro as Error, res);
  } finally {
    convertido?.limpar();
  }
};

/**
 * Turno do agente: áudio ou texto.
 * Com áudio, responde com texto E com o áudio da resposta.
 */
export const turno = async (req: Request, res: Response): Promise<Response> => {
  let convertido: { arquivo: string; limpar: () => void } | null = null;

  try {
    const identidade = IDENTIDADE(req);
    const companyId = Number(identidade.companyId);

    const settings = await settingsDaEmpresa(companyId);
    const arquivo = req.file;
    const textoDigitado = String(req.body?.texto ?? "").trim();

    let texto = textoDigitado;

    if (arquivo?.buffer?.length) {
      convertido = await converterParaWav(arquivo.buffer, arquivo.mimetype);
      texto = await transcreverAudio({
        settings,
        audio: fs.readFileSync(convertido.arquivo),
        nomeArquivo: "agente.wav",
        mimeType: "audio/wav",
        idioma: "pt"
      });
    }

    if (!texto) throw new AiHttpError("Não ouvi nada. Tente de novo.", 400);

    const resposta: RespostaAgente = await processarTurno({
      companyId,
      userId: Number(identidade.id),
      profile: identidade.profile,
      texto
    });

    // Áudio da resposta é convenience: se o TTS falhar, o texto já chegou.
    let audio: { base64: string; mimeType: string } | null = null;
    try {
      const fala = await gerarAudio({ settings, texto: resposta.fala });
      audio = {
        base64: fala.buffer.toString("base64"),
        mimeType: fala.mimeType
      };
    } catch {
      audio = null;
    }

    return res.status(200).json({ ...resposta, transcricao: texto, audio });
  } catch (erro) {
    return responder(erro as Error, res);
  } finally {
    convertido?.limpar();
  }
};

/** Confirma (ou recusa) a ação que ficou pendente. */
export const confirmar = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const identidade = IDENTIDADE(req);
    const companyId = Number(identidade.companyId);
    const chave = String(req.body?.chave ?? "");
    const aceite = req.body?.aceite !== false;

    if (!chave) throw new AiHttpError("Chave da ação não informada", 400);

    const settings = await settingsDaEmpresa(companyId);
    const ctx = contexto(identidade, settings);

    if (!aceite) {
      limparPendentesDoUsuario(Number(identidade.id));
      return res.status(200).json({ fala: "Ação cancelada.", executou: false });
    }

    if (!ctx.podeEscrever) {
      throw new AiHttpError("Você não pode alterar tickets", 403);
    }

    const resultado = await confirmarAcao(chave, ctx);

    // Chave expirada devolve executou: false; a UI não deve dizer que mudou.
    if (resultado.executou === false) {
      return res.status(200).json({
        fala: resultado.fala,
        dados: null,
        executou: false,
        audio: null
      });
    }

    let audio: { base64: string; mimeType: string } | null = null;
    try {
      const fala = await gerarAudio({ settings, texto: resultado.fala });
      audio = {
        base64: fala.buffer.toString("base64"),
        mimeType: fala.mimeType
      };
    } catch {
      audio = null;
    }

    return res.status(200).json({
      fala: resultado.fala,
      dados: resultado.dados ?? null,
      executou: true,
      audio
    });
  } catch (erro) {
    return responder(erro as Error, res);
  }
};

/** Esquece as ações pendentes (operador mudou de assunto). */
export const resetar = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const identidade = IDENTIDADE(req);
    const userId = Number(identidade.id);
    limparPendentesDoUsuario(userId);
    // Sem isso o próximo turno ainda enxergaria o assunto anterior.
    limparHistorico(Number(identidade.companyId), userId);
    return res.status(200).json({ ok: true });
  } catch (erro) {
    return responder(erro as Error, res);
  }
};

export const uploadMiddleware = upload.single("audio");
