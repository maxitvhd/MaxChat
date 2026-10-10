/**
 * services/AiServices/TtsToWhatsAppService.ts |
 * descrição: quando o cliente manda áudio, a IA responde em texto e também
 *            em voz. Aqui o texto vira fala pelo TTS configurado na empresa,
 *            é convertido para Opus/Ogg (formato de mensagem de voz do
 *            WhatsApp) e enviado como áudio gravado (ptt).
 *
 *            Nunca lança: o texto já foi entregue antes, então uma falha na
 *            voz só fica registrada no log.
 */
import { WASocket } from "@whiskeysockets/baileys";
import fs from "fs";
import os from "os";
import path from "path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";

import logger from "../../utils/logger";
import { gerarAudio } from "./TtsService";
import ShowAiProviderSettingsService from "../AiProviderSettingsServices/ShowAiProviderSettingsService";
import { AiSettingsLike, TtsProvider } from "./types";

const BINARIO_FFMPEG = ffmpegInstaller?.path || "/usr/bin/ffmpeg";

// Tiro a formatação do WhatsApp (*negrito*, _itálico_, links, emojis) pra
// voz não ler "asterisco" nem soletrar URL.
const limparParaFala = (texto: string): string =>
  texto
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_~`#>]/g, "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

// O WhatsApp só mostra como "mensagem de voz" se for Opus dentro de Ogg
const converterParaOpus = async (
  buffer: Buffer,
  extensao: string
): Promise<Buffer> => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "tts-"));
  const origem = path.join(pasta, `origem.${extensao || "mp3"}`);
  const destino = path.join(pasta, "voz.ogg");

  try {
    fs.writeFileSync(origem, buffer);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(origem)
        .setFfmpegPath(BINARIO_FFMPEG)
        .audioCodec("libopus")
        .audioChannels(1)
        .audioFrequency(48000)
        .format("ogg")
        .save(destino)
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err));
    });

    return fs.readFileSync(destino);
  } finally {
    try {
      fs.rmSync(pasta, { recursive: true, force: true });
    } catch {
      // pasta temporária, não vale derrubar o envio por isso
    }
  }
};

export const enviarRespostaEmAudio = async ({
  wbot,
  jid,
  texto,
  companyId,
  ticketId
}: {
  wbot: WASocket;
  jid: string;
  texto: string;
  companyId: number;
  ticketId: number;
}): Promise<boolean> => {
  try {
    const fala = limparParaFala(texto);
    if (!fala) return false;

    const registro = await ShowAiProviderSettingsService({ companyId });
    const settings = registro.toJSON() as unknown as AiSettingsLike;

    if (String(settings.ttsProvider ?? "").toLowerCase() === TtsProvider.DISABLED) {
      return false;
    }

    const audio = await gerarAudio({ settings, texto: fala });
    const opus = await converterParaOpus(audio.buffer, audio.extension);

    await wbot.sendMessage(jid, {
      audio: opus,
      mimetype: "audio/ogg; codecs=opus",
      ptt: true
    });

    logger.info(
      `[TTS] resposta em áudio enviada ticket=${ticketId} (${opus.length} bytes)`
    );
    return true;
  } catch (e) {
    logger.error(
      `[TTS] falha ao gerar/enviar áudio ticket=${ticketId}: ${(e as Error).message}`
    );
    return false;
  }
};
