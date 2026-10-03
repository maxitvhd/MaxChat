/**
 * @TercioSantos-0 |
 * services/AiServices/SttFromWhatsAppService.ts |
 * descrição: transforma o áudio que chega do WhatsApp em texto.
 *
 *              Sem isto o bot recebia a string "Áudio" como se fosse a
 *              mensagem do cliente e respondia no escuro. Aqui o áudio é
 *              baixado, convertido para o formato que o Whisper entende de
 *              verdade e transcrito pelas configurações da empresa.
 *
 *              Conversão: o WhatsApp manda voz em Opus dentro de OGG. Testado
 *              contra o endpoint real, o Opus voltava com texto vazio
 *              ("..."), enquanto o mesmo áudio em WAV 16kHz mono foi
 *              transcrito corretamente. Por isso o passo é obrigatório.
 */
import { downloadMediaMessage, proto, WASocket } from "@whiskeysockets/baileys";
import fs from "fs";
import os from "os";
import path from "path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";

import logger from "../../utils/logger";
import { transcreverAudio } from "./SttService";
import ShowAiProviderSettingsService from "../AiProviderSettingsServices/ShowAiProviderSettingsService";
import { AiSettingsLike } from "./types";

// O binário embutido no pacote npm vem sempre junto do deploy, então não
// depende de alguém instalar ffmpeg na máquina. O do sistema é o reserva.
const BINARIO_FFMPEG = ffmpegInstaller?.path || "/usr/bin/ffmpeg";

/** WhatsApp manda voz em Opus/Ogg, mas audioMessage pode vir como mp4. */
const extensaoDoMime = (mimeType: string): string => {
  const tipo = String(mimeType || "").split(";")[0].trim().toLowerCase();
  if (tipo === "audio/mp4" || tipo === "audio/m4a" || tipo === "audio/x-m4a") {
    return ".m4a";
  }
  if (tipo === "audio/mpeg" || tipo === "audio/mp3") return ".mp3";
  if (tipo === "audio/wav" || tipo === "audio/x-wav" || tipo === "audio/wave") {
    return ".wav";
  }
  return ".ogg";
};

/** Extrai o audioMessage de qualquer variação de container do WhatsApp. */
const pegarAudio = (
  msg: proto.IWebMessageInfo
): proto.Message.IAudioMessage | undefined =>
  msg.message?.audioMessage ||
  msg.message?.ephemeralMessage?.message?.audioMessage ||
  msg.message?.viewOnceMessage?.message?.audioMessage ||
  msg.message?.viewOnceMessageV2?.message?.audioMessage ||
  msg.message?.documentWithCaptionMessage?.message?.audioMessage ||
  undefined;

export const ehMensagemDeAudio = (msg: proto.IWebMessageInfo): boolean =>
  !!pegarAudio(msg);

export interface ResultadoStt {
  /** texto transcrito; vazio quando não deu para entender */
  texto: string;
  /** true quando o áudio foi transcrito com sucesso */
  transcreveu: boolean;
  /** motivo da falha, para o log e para a resposta de fallback */
  erro: string | null;
}

/**
 * Converte o buffer para WAV 16kHz mono, que é o formato nativo do Whisper.
 * Usa uma pasta temporária porque o arquivo só existe durante a transcrição.
 */
const converterParaWav = async (
  buffer: Buffer,
  mimeType: string
): Promise<{ arquivo: string; limpar: () => void }> => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "stt-"));
  // ffmpeg deduz o formato do container pela extensao do arquivo de entrada.
  const origem = path.join(pasta, `origem${extensaoDoMime(mimeType)}`);
  const destino = path.join(pasta, "audio.wav");

  fs.writeFileSync(origem, buffer);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(origem)
      .setFfmpegPath(BINARIO_FFMPEG)
      .audioCodec("pcm_s16le")
      .audioFrequency(16000)
      .audioChannels(1)
      .format("wav")
      .save(destino)
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err));
  });

  return {
    arquivo: destino,
    limpar: () => {
      try {
        fs.rmSync(pasta, { recursive: true, force: true });
      } catch {
        // pasta temporária: não vale Falhar o fluxo por causa da limpeza
      }
    }
  };
};

/**
 * Baixa, converte e transcreve o áudio da mensagem.
 * Nunca lança: devolve o motivo da falha para quem chama decidir a resposta.
 */
export const transcreverAudioDoWhatsApp = async ({
  msg,
  wbot,
  companyId
}: {
  msg: proto.IWebMessageInfo;
  wbot: WASocket;
  companyId: number;
}): Promise<ResultadoStt> => {
  const audio = pegarAudio(msg);
  if (!audio) return { texto: "", transcreveu: false, erro: "mensagem sem áudio" };

  let buffer: Buffer;
  try {
    buffer = (await downloadMediaMessage(
      msg,
      "buffer",
      {},
      { logger, reuploadRequest: wbot.updateMediaMessage }
    )) as Buffer;
  } catch (e) {
    const erro = `falha ao baixar áudio: ${(e as Error).message}`;
    logger.error(`[STT] ${erro}`);
    return { texto: "", transcreveu: false, erro };
  }

  if (!buffer?.length) {
    logger.error("[STT] áudio baixado está vazio");
    return { texto: "", transcreveu: false, erro: "áudio vazio" };
  }

  const { arquivo, limpar } = await converterParaWav(
    buffer,
    audio.mimetype || "audio/ogg"
  );

  try {
    const registro = await ShowAiProviderSettingsService({ companyId });
    const settings = registro.toJSON() as unknown as AiSettingsLike;

    const texto = (
      await transcreverAudio({
        settings,
        audio: fs.readFileSync(arquivo),
        nomeArquivo: "audio.wav",
        mimeType: "audio/wav",
        idioma: "pt"
      })
    ).trim();

    if (!texto) {
      logger.warn(`[STT] áudio transcrito como vazio (company=${companyId})`);
      return { texto: "", transcreveu: false, erro: "transcrição vazia" };
    }

    logger.info(
      `[STT] company=${companyId} áudio transcrito (${buffer.length} bytes -> "${texto}")`
    );

    return { texto, transcreveu: true, erro: null };
  } catch (e) {
    const erro = (e as Error).message;
    logger.error(`[STT] company=${companyId} falha ao transcrever: ${erro}`);
    return { texto: "", transcreveu: false, erro };
  } finally {
    limpar();
  }
};