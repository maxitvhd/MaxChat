/**
 * @TercioSantos-0 |
 * services/AiServices/rotaTriagem.ts |
 * descrição: aplica a decisão de roteamento que a IA tomou no chat.
 *
 *              A fila Triagem não vende nem resolve: ela pergunta o assunto
 *              (departamento) e a empresa, e devolve a escolha no fim da
 *              resposta usando o marcador `[[ROTA:Nome da fila]]`.
 *
 *              A marcação é um acuerdo entre o prompt e este código:
 *              - o prompt manda o bot emitir o marcador depois de confirmar;
 *              - este arquivo tira o marcador do texto antes de enviar, para
 *                o cliente nunca ver a marcação;
 *              - a fila só é trocada se o nome existir na mesma empresa. Nome
 *                desconhecido é ignorado e o ticket fica na Triagem.
 *
 *              Não é o JEV que roteia: o JEV classifica intenção e certeza.
 *              A escolha do cliente é o que move o ticket.
 */
import logger from "../../utils/logger";
import Queue from "../../models/Queue";
import CreateLogTicketService from "../TicketServices/CreateLogTicketService";

/** Marcador de rota aceito: [[ROTA:MaxGas]] */
const MARCADOR_ROTA = /\[\[\s*ROTA\s*:\s*([^\]]{1,60})\s*\]\]/gi;

/** Remove acento, caixa e pontuação para comparar nomes de fila. */
export const normalizarNome = (valor: string): string =>
  String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export interface ResultadoRota {
  /** texto que vai realmente para o WhatsApp, sem o marcador */
  texto: string;
  /** nome de fila pedido pela IA, quando houver */
  nomeSolicitado: string | null;
  /** fila encontrada na empresa, quando o nome bater */
  fila: Queue | null;
}

/**
 * Lê o(s) marcador(es) do texto e devolve o texto limpo.
 * Não toca no banco: só interpretamos aqui para o envio decidir.
 */
export const extrairRota = async (
  reply: string,
  companyId: number
): Promise<ResultadoRota> => {
  const texto = String(reply || "");

  const pedidos: string[] = [];
  let match: RegExpExecArray | null;
  const busca = new RegExp(MARCADOR_ROTA.source, "gi");

  // eslint-disable-next-line no-cond-assign
  while ((match = busca.exec(texto)) !== null) {
    pedidos.push(match[1].trim());
  }

  const limpo = texto.replace(MARCADOR_ROTA, "").trim();

  if (!pedidos.length) {
    return { texto: limpo, nomeSolicitado: null, fila: null };
  }

  const nomeSolicitado = pedidos[0];
  const alvo = normalizarNome(nomeSolicitado);

  // Marcador sem nome ("[[ROTA: ]]") não pode virar rota: o casamento por
  // "includes" pegaria a primeira fila da lista sem querer.
  if (!alvo) {
    logger.warn("[ROTA] marcador sem nome de fila; ticket permanece na Triagem");
    return { texto: limpo, nomeSolicitado: null, fila: null };
  }

  // Whitelist: só filas da própria empresa, e nunca a própria Triagem,
  // senão o bot ficaria preso nela para sempre.
  // A coluna companyId existe na tabela, mas não está mapeada no model,
  // então o filtro vai pelo mesmo caminho que o ListQueuesService já usa.
  const filas = await Queue.findAll({
    where: { companyId } as any,
    attributes: ["id", "name"]
  });

  const lista = filas
    .map((fila) => fila.toJSON() as Queue)
    .filter((fila) => normalizarNome(fila.name) !== "triagem");

  // Nome exato primeiro. O "includes" é só tolerância a erro de digitação
  // ("Max Gas", "maximo.tec") e exige alvo mínimo, senão "gas" puxaria a
  // fila errada.
  const podeSerAproximado = alvo.length >= 4;
  const encontrada =
    lista.find((fila) => normalizarNome(fila.name) === alvo) ||
    (podeSerAproximado
      ? lista.find((fila) => normalizarNome(fila.name).includes(alvo))
      : null) ||
    null;

  if (!encontrada) {
    logger.warn(
      `[ROTA] fila não encontrada para "${nomeSolicitado}"; ticket permanece na Triagem`
    );
    return { texto: limpo, nomeSolicitado, fila: null };
  }

  return { texto: limpo, nomeSolicitado, fila: encontrada };
};

/**
 * Aplica a troca de fila e registra no histórico do ticket.
 * Devolve o id da fila nova, ou null quando nada foi feito.
 */
export const aplicarRota = async (
  ticket: any,
  companyId: number,
  fila: Queue | null
): Promise<number | null> => {
  if (!fila) return null;

  const filaAtual = ticket.queueId;
  if (filaAtual === fila.id) return null;

  await ticket.update({
    queueId: fila.id,
    userId: null,
    status: "pending",
    sendInactiveMessage: false
  });

  await CreateLogTicketService({
    ticketId: ticket.id,
    type: "queue",
    queueId: fila.id
  });

  logger.info(
    `[ROTA] ticket=${ticket.id} movido da fila ${filaAtual} para ${fila.id} (${fila.name}) pela IA`
  );

  return fila.id;
};