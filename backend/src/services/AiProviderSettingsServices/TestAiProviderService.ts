/**
 * @TercioSantos-0 |
 * service/AiProviderSettingsServices/TestAiProviderService |
 * @descrição: testa a conexão de um provider sem persistir nada.
 *              Cada teste é isolado: uma falha não derruba os demais.
 */
import { aiRequest, joinUrl } from "../AiServices/http";
import { isBlank, AiSettingsLike } from "../AiServices/types";
import { listarModelosOllama } from "../AiServices/OllamaService";
import { gerarAudio } from "../AiServices/TtsService";
import { transcreverAudio } from "../AiServices/SttService";
import { garantirWav } from "../AiServices/pcm";
import { executarJev } from "../AiServices/JevService";
import { executarLaya } from "../AiServices/LayaService";
import {
  listarColecoesDaEmpresa,
  verificarConexao as verificarQdrant
} from "../AiServices/QdrantService";

export type AlvoTeste =
  | "ollama"
  | "openai"
  | "gemini"
  | "anthropic"
  | "tts"
  | "stt"
  | "jev"
  | "laya"
  | "qdrant";

export interface ResultadoTeste {
  ok: boolean;
  alvo: string;
  mensagem: string;
  detalhe?: unknown;
}

const erro = (alvo: string, e: unknown): ResultadoTeste => {
  const m = e as { message?: string; status?: number };
  return {
    ok: false,
    alvo,
    mensagem: m?.message ?? "Falha desconhecida",
    detalhe: { status: m?.status }
  };
};

const testarOllama = async (
  settings: AiSettingsLike
): Promise<ResultadoTeste> => {
  try {
    const modelos = await listarModelosOllama(settings);
    return {
      ok: modelos.length > 0,
      alvo: "ollama",
      mensagem: modelos.length
        ? `${modelos.length} modelo(s) disponível(is)`
        : "Servidor respondeu, mas sem modelos",
      detalhe: modelos.slice(0, 50).map(m => m.id)
    };
  } catch (e) {
    return erro("ollama", e);
  }
};

const testarOpenAiLike = async (
  settings: AiSettingsLike,
  alvo: "openai" | "gemini" | "anthropic"
): Promise<ResultadoTeste> => {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    let url = "";

    if (alvo === "openai") {
      if (isBlank(settings.openaiApiKey))
        throw new Error("API key não configurada");
      const base = isBlank(settings.openaiUrl)
        ? "https://api.openai.com/v1"
        : String(settings.openaiUrl);
      url = /\/v1$/i.test(base.replace(/\/+$/, ""))
        ? joinUrl(base, "/models")
        : joinUrl(base, "/v1/models");
      headers.Authorization = `Bearer ${settings.openaiApiKey}`;
    }

    if (alvo === "gemini") {
      if (isBlank(settings.geminiApiKey))
        throw new Error("API key não configurada");
      const base = isBlank(settings.geminiUrl)
        ? "https://generativelanguage.googleapis.com"
        : String(settings.geminiUrl);
      url = joinUrl(base, "/v1beta/models");
      headers["x-goog-api-key"] = String(settings.geminiApiKey);
    }

    if (alvo === "anthropic") {
      if (isBlank(settings.anthropicApiKey))
        throw new Error("API key não configurada");
      url = joinUrl(
        isBlank(settings.anthropicUrl)
          ? "https://api.anthropic.com"
          : String(settings.anthropicUrl),
        "/v1/models"
      );
      headers["x-api-key"] = String(settings.anthropicApiKey);
      headers["anthropic-version"] = "2023-06-01";
    }

    const bruto = await aiRequest<{ data?: unknown[]; models?: unknown[] }>({
      label: `teste-${alvo}`,
      method: "GET",
      url,
      timeout: settings.requestTimeout,
      headers,
      retries: 0
    });

    const total = bruto?.data?.length ?? bruto?.models?.length ?? 0;
    return {
      ok: true,
      alvo,
      mensagem: `Conexão OK (${total} modelo(s) listado(s))`
    };
  } catch (e) {
    return erro(alvo, e);
  }
};

const testarTts = async (settings: AiSettingsLike): Promise<ResultadoTeste> => {
  try {
    const audio = await gerarAudio({
      settings,
      texto: "Teste de voz do MaxChat."
    });
    return {
      ok: audio.buffer.length > 0,
      alvo: "tts",
      mensagem: `Áudio gerado: ${audio.buffer.length} bytes (${audio.extension})`,
      detalhe: { mimeType: audio.mimeType, bytes: audio.buffer.length }
    };
  } catch (e) {
    return erro("tts", e);
  }
};

const testarQdrant = async (
  settings: AiSettingsLike,
  companyId: number
): Promise<ResultadoTeste> => {
  try {
    await verificarQdrant({ settings, companyId });
    const colecoes = await listarColecoesDaEmpresa({ settings, companyId });
    return {
      ok: true,
      alvo: "qdrant",
      mensagem: `Conexão OK. ${colecoes.length} coleção(ões) da empresa`,
      detalhe: colecoes
    };
  } catch (e) {
    return erro("qdrant", e);
  }
};

const testarJev = async (settings: AiSettingsLike): Promise<ResultadoTeste> => {
  try {
    const resultado = await executarJev({
      settings,
      message:
        "Teste de conexão do MaxChat. O cliente quer o status do pedido 1234."
    });
    return {
      ok: true,
      alvo: "jev",
      mensagem: `Conexão OK (modelo ${resultado.model ?? "desconhecido"})`,
      detalhe: {
        intencao: resultado.intencao,
        certeza: resultado.scoreLegenda,
        confidence: resultado.confidence,
        abstained: resultado.abstained,
        tokens: resultado.usage
      }
    };
  } catch (e) {
    return erro("jev", e);
  }
};

const testarLaya = async (
  settings: AiSettingsLike
): Promise<ResultadoTeste> => {
  try {
    const resultado = await executarLaya({
      settings,
      message: "Teste de conexão do MaxChat.",
      primitive: "routing"
    });
    return {
      ok: true,
      alvo: "laya",
      mensagem: `Conexão OK (confiança ${resultado.confidence ?? "-"})`,
      detalhe: { reply: resultado.reply.slice(0, 200) }
    };
  } catch (e) {
    return erro("laya", e);
  }
};

const testarStt = async (settings: AiSettingsLike): Promise<ResultadoTeste> => {
  try {
    // WAV de 0,4s de silêncio: validar a transcodificação sem depender de arquivo.
    const buffer = garantirWav(Buffer.alloc(24000 * 2));
    const texto = await transcreverAudio({
      settings,
      audio: buffer,
      mimeType: "audio/wav",
      nomeArquivo: "teste-maxchat.wav"
    });
    return {
      ok: true,
      alvo: "stt",
      mensagem: `Conexão OK (transcrição: "${texto || "vazio"}")`,
      detalhe: { bytes: buffer.length }
    };
  } catch (e) {
    return erro("stt", e);
  }
};

export const TestAiProviderService = async (
  alvo: AlvoTeste,
  settings: AiSettingsLike,
  companyId: number
): Promise<ResultadoTeste> => {
  switch (alvo) {
    case "ollama":
      return testarOllama(settings);
    case "openai":
      return testarOpenAiLike(settings, "openai");
    case "gemini":
      return testarOpenAiLike(settings, "gemini");
    case "anthropic":
      return testarOpenAiLike(settings, "anthropic");
    case "tts":
      return testarTts(settings);
    case "stt":
      return testarStt(settings);
    case "jev":
      return testarJev(settings);
    case "laya":
      return testarLaya(settings);
    case "qdrant":
      return testarQdrant(settings, companyId);
    default:
      return { ok: false, alvo, mensagem: "Alvo de teste desconhecido" };
  }
};
