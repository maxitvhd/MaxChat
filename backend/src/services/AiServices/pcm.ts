/**
 * @TercioSantos-0 |
 * services/AiServices/pcm |
 * @descrição: conversão de PCM cru para WAV em Node puro.
 *              O Gemini TTS (modelos 2.5 preview) devolve PCM s16le 24kHz mono
 *              sem header. Montar o header RIFF aqui evita depender do ffmpeg,
 *              que não existe no servidor.
 */

export const GEMINI_PCM_SAMPLE_RATE = 24000;
export const GEMINI_PCM_CHANNELS = 1;
export const GEMINI_PCM_BITS = 16;

/** Cria um header WAV (44 bytes) para dados PCM s16le. */
export const wavHeader = (
  tamanhoDados: number,
  sampleRate = GEMINI_PCM_SAMPLE_RATE,
  channels = GEMINI_PCM_CHANNELS,
  bits = GEMINI_PCM_BITS
): Buffer => {
  const bytesPorSample = bits / 8;
  const blockAlign = channels * bytesPorSample;
  const byteRate = sampleRate * blockAlign;

  const header = Buffer.alloc(44);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + tamanhoDados, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // tamanho do bloco fmt
  header.writeUInt16LE(1, 20); // PCM sem compressão
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(tamanhoDados, 40);

  return header;
};

/** Junta header WAV + PCM cru. */
export const pcmParaWav = (
  pcm: Buffer,
  sampleRate = GEMINI_PCM_SAMPLE_RATE,
  channels = GEMINI_PCM_CHANNELS,
  bits = GEMINI_PCM_BITS
): Buffer =>
  Buffer.concat([wavHeader(pcm.length, sampleRate, channels, bits), pcm]);

/** Detecta se o buffer já começa com um header RIFF/WAVE. */
export const jaEhWav = (buffer: Buffer): boolean =>
  buffer.length > 12 &&
  buffer.toString("ascii", 0, 4) === "RIFF" &&
  buffer.toString("ascii", 8, 12) === "WAVE";

/** Normaliza qualquer saída de TTS para WAV com header válido. */
export const garantirWav = (buffer: Buffer): Buffer =>
  jaEhWav(buffer) ? buffer : pcmParaWav(buffer);
