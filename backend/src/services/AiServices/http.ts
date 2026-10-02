/**
 * @TercioSantos-0 |
 * services/AiServices/http |
 * @descrição: wrapper de HTTP (axios) com timeout, retry e erro normalizado.
 *              Usado por todos os adapters de IA. Sem SDK extra.
 */
import axios, { AxiosRequestConfig, AxiosInstance } from "axios";
import logger from "../../utils/logger";
import { DEFAULT_TIMEOUT } from "./types";

const RETRYABLE_STATUS = [408, 425, 429, 500, 502, 503, 504, 529];

/** Converte corpo de erro em texto legível (vem Buffer quando é arraybuffer). */
const corpoLegivel = (data: unknown): unknown => {
  if (Buffer.isBuffer(data)) return data.toString("utf8").slice(0, 800);
  return data;
};

export class AiHttpError extends Error {
  public status: number;

  public responseBody: unknown;

  constructor(message: string, status: number, responseBody?: unknown) {
    super(message);
    this.name = "AiHttpError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

const buildClient = (timeout?: number): AxiosInstance =>
  axios.create({
    timeout: timeout && timeout > 0 ? timeout : DEFAULT_TIMEOUT,
    validateStatus: () => true
  });

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

/**
 * Executa a requisição com retry exponencial apenas em erros
 * transitórios (timeout, 429 e 5xx). Erros de configuração não são repetidos.
 */
export const aiRequest = async <T = unknown>(
  config: AxiosRequestConfig & {
    timeout?: number;
    retries?: number;
    label?: string;
  }
): Promise<T> => {
  const { retries = 2, label = "ai", timeout, ...axiosConfig } = config;
  const client = buildClient(timeout);

  let ultimaFalha: AiHttpError | null = null;

  // O await dentro do laco e essencial: o retry precisa ser sequencial
  // (cada tentativa espera a resposta da anterior antes de decidir).
  /* eslint-disable no-await-in-loop */
  for (let tentativa = 0; tentativa <= retries; tentativa += 1) {
    try {
      // Padrão é JSON. Chamadas de áudio passam responseType: "arraybuffer".
      const resposta = await client.request({
        responseType: "json",
        ...axiosConfig
      });

      if (resposta.status >= 200 && resposta.status < 300) {
        return resposta.data as T;
      }

      const erro = new AiHttpError(
        `Falha na chamada ${label} (HTTP ${resposta.status})`,
        resposta.status,
        corpoLegivel(resposta.data)
      );

      if (
        !RETRYABLE_STATUS.includes(resposta.status) ||
        tentativa === retries
      ) {
        throw erro;
      }

      ultimaFalha = erro;
    } catch (e) {
      if (e instanceof AiHttpError) {
        if (!RETRYABLE_STATUS.includes(e.status) || tentativa === retries)
          throw e;
        ultimaFalha = e;
      } else {
        const mensagem = (e as Error).message || "erro desconhecido";
        const ehTimeout =
          /timeout/i.test(mensagem) ||
          (e as { code?: string }).code === "ECONNABORTED";

        if (!ehTimeout || tentativa === retries) {
          throw new AiHttpError(`Falha de rede em ${label}: ${mensagem}`, 0);
        }
        ultimaFalha = new AiHttpError(
          `Falha de rede em ${label}: ${mensagem}`,
          0
        );
      }
    }

    const espera = 500 * 2 ** tentativa;
    logger.warn(
      `[AiHttp] ${label} falhou (tentativa ${tentativa + 1}/${
        retries + 1
      }). Nova tentativa em ${espera}ms`
    );
    await sleep(espera);
  }
  /* eslint-enable no-await-in-loop */

  throw ultimaFalha ?? new AiHttpError(`Falha na chamada ${label}`, 0);
};

/** Remove barra final duplicada para montar URLs. */
export const joinUrl = (base: string, path: string): string =>
  `${String(base).replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;

/** Lê corpo binário (áudio) garantindo que veio realmente em arraybuffer. */
export const toBuffer = (data: unknown): Buffer => {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    return Buffer.from((data as ArrayBufferView).buffer);
  }
  return Buffer.from(String(data ?? ""), "binary");
};
