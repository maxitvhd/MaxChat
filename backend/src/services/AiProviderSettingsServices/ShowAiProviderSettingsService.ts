/**
 * @TercioSantos-0 |
 * service/AiProviderSettingsServices/ShowAiProviderSettingsService |
 * @descrição: lê as configurações de IA da empresa. Se a linha ainda não
 *              existir, cria uma com os padrões seguros.
 *              As chaves (API keys) NUNCA voltam em texto puro: são
 *              substituídas pela máscara e sinalizadas em campos *Configurado.
 */
import AiProviderSettings from "../../models/AiProviderSettings";
import { SECRET_FIELDS, MASK } from "../AiServices/types";

interface Request {
  companyId: number;
}

/** Remove os segredos do objeto e sinaliza quais já foram configurados. */
export const mascararSegredos = <T extends Record<string, unknown>>(
  registro: T
): T => {
  const saida = { ...registro } as Record<string, unknown>;

  SECRET_FIELDS.forEach(campo => {
    const valor = saida[campo];
    const configurado = typeof valor === "string" && valor.trim().length > 0;
    saida[campo] = configurado ? MASK : "";
    saida[`${campo}Configurado`] = configurado;
  });

  // Remove o prefixo interno de tenant, se vier junto.
  delete saida.tenant;
  delete saida.password;
  delete saida.token;

  return saida as T;
};

const ShowAiProviderSettingsService = async ({
  companyId
}: Request): Promise<AiProviderSettings> => {
  let registro = await AiProviderSettings.findOne({ where: { companyId } });

  if (!registro) {
    registro = await AiProviderSettings.create({ companyId });
  }

  return registro;
};

/** Mesma consulta, porém já com os segredos mascarados para o frontend. */
export const ShowAiProviderSettingsMascarado = async ({
  companyId
}: Request): Promise<Record<string, unknown>> => {
  const registro = await ShowAiProviderSettingsService({ companyId });
  return mascararSegredos(
    registro.toJSON() as unknown as Record<string, unknown>
  );
};

export default ShowAiProviderSettingsService;
