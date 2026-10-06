/**
 * @TercioSantos-0 |
 * service/AiProviderSettingsServices/UpdateAiProviderSettingsService |
 * @descrição: atualiza as configurações de IA da empresa.
 *
 *              Três garantias aqui:
 *              1. Só a empresa do token (companyId) é alterada.
 *              2. Whitelist de campos: o body não vira coluna livre.
 *              3. Campo de chave igual à máscara não sobrescreve o valor real,
 *                 evitando que o frontend apague a chave ao reexibir "********".
 */
import AiProviderSettings from "../../models/AiProviderSettings";
import { SECRET_FIELDS, MASK } from "../AiServices/types";
import { mascararSegredos } from "./ShowAiProviderSettingsService";

interface Request {
  companyId: number;
  data: Record<string, unknown>;
}

/** Campos que o frontend pode gravar. companyId e id ficam de fora de propósito. */
export const CAMPOS_PERMITIDOS = [
  "enabled",
  "defaultReplyEngine",
  "routingEngine",
  "routingConfidenceThreshold",
  "fallbackOnLowConfidence",
  "requestTimeout",
  "memoryEnabled",
  "maxHistoryMessages",
  "ollamaUrl",
  "ollamaModel",
  "openaiUrl",
  "openaiApiKey",
  "openaiModel",
  "geminiUrl",
  "geminiApiKey",
  "geminiModel",
  "anthropicUrl",
  "anthropicApiKey",
  "anthropicModel",
  "jevUrl",
  "jevApiKey",
  "jevModel",
  "jevQuestions",
  "layaUrl",
  "layaApiKey",
  "layaModel",
  "ttsProvider",
  "ttsUrl",
  "ttsApiKey",
  "ttsModel",
  "ttsVoice",
  "ttsFormat",
  "ttsSpeed",
  "ttsRegion",
  "ttsEndpoint",
  "ttsDeployment",
  "sttProvider",
  "sttUrl",
  "sttApiKey",
  "sttModel",
  "qdrantEnabled",
  "qdrantUrl",
  "qdrantApiKey",
  "qdrantCollectionPrefix",
  "embeddingModel",
  "memoryCollection",
  "voiceAgentEnabled",
  "voiceAgentModel",
  "voiceAgentPermission",
  "voiceAgentConfidence"
] as const;

/** Quem pode acionar o agente de voz para alterar tickets. */
export const PERMISSOES_VOZ = ["admin", "all"] as const;

const BOOLEANOS = new Set([
  "enabled",
  "fallbackOnLowConfidence",
  "memoryEnabled",
  "qdrantEnabled",
  "voiceAgentEnabled"
]);

const NUMERICOS = new Set([
  "routingConfidenceThreshold",
  "requestTimeout",
  "maxHistoryMessages",
  "ttsSpeed",
  "voiceAgentConfidence"
]);

const TIPOS_DE_CHAVE = new Set<string>(SECRET_FIELDS);

const normalizar = (campo: string, valor: unknown): unknown => {
  // Permissão tem lista fechada: texto solto não vira regra de acesso.
  if (campo === "voiceAgentPermission") {
    const texto = String(valor ?? "").trim().toLowerCase();
    return (PERMISSOES_VOZ as readonly string[]).includes(texto) ? texto : undefined;
  }

  // Confiança entre 0 e 1; fora disso o backend recusa o valor.
  if (campo === "voiceAgentConfidence") {
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero < 0 || numero > 1) return undefined;
    return numero;
  }

  if (BOOLEANOS.has(campo)) {
    if (typeof valor === "boolean") return valor;
    return ["true", "1", "enabled", "sim"].includes(
      String(valor).toLowerCase()
    );
  }

  if (NUMERICOS.has(campo)) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : undefined;
  }

  return typeof valor === "string" ? valor.trim() : valor;
};

const UpdateAiProviderSettingsService = async ({
  companyId,
  data
}: Request): Promise<Record<string, unknown>> => {
  const registro = await AiProviderSettings.findOne({ where: { companyId } });

  if (!registro) {
    await AiProviderSettings.create({ companyId });
  }

  const payload: Record<string, unknown> = {};

  Object.entries(data).forEach(([campo, valor]) => {
    // Whitelist: qualquer campo fora da lista é descartado.
    if (!(CAMPOS_PERMITIDOS as readonly string[]).includes(campo)) return;

    // Chave: se veio mascarada ou vazia, mantém o que já existe no banco.
    if (TIPOS_DE_CHAVE.has(campo)) {
      if (
        valor === MASK ||
        valor === undefined ||
        valor === null ||
        String(valor).trim() === ""
      ) {
        return;
      }
      payload[campo] = String(valor).trim();
      return;
    }

    const normalizado = normalizar(campo, valor);
    if (normalizado === undefined) return;
    payload[campo] = normalizado;
  });

  if (Object.keys(payload).length === 0) {
    const atual = await AiProviderSettings.findOne({ where: { companyId } });
    return mascararSegredos(
      (atual?.toJSON() ?? {}) as unknown as Record<string, unknown>
    );
  }

  // companyId tem índice único, então o update só toca na linha da empresa.
  await AiProviderSettings.update(payload, { where: { companyId } });

  const atualizado = await AiProviderSettings.findOne({ where: { companyId } });
  return mascararSegredos(
    (atualizado?.toJSON() ?? {}) as unknown as Record<string, unknown>
  );
};

export default UpdateAiProviderSettingsService;
