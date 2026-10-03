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

/**
 * Distância de edição (Levenshtein) entre duas strings.
 * Precisa ser barata: roda uma vez por fila da empresa a cada audio ou
 * mensagem com marcador, no máximo umas 15 vezes.
 */
const distanciaEdicao = (a: string, b: string): number => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const atual = [i];

    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(
        atual[j - 1] + 1,
        anterior[j] + 1,
        anterior[j - 1] + custo
      );
    }

    anterior = atual;
  }

  return anterior[b.length];
};

/**
 * Tolera o erro de transcricao do Whisper.
 * O modelo escreve "MaxiCote" para MaxCheckout e "MaxGass" para MaxGas, e
 * o `includes` antigo nao pegava nome comprimido. Aqui a tolerancia cresce
 * com o tamanho da fila, mas nunca chega a aceitar outro nome: exige que as
 * duas strings sejam parecidas e que o pedido tenha o mesmo comprimento
 * aproximado da fila.
 */
const pareceNomeDeFila = (pedido: string, fila: string): boolean => {
  if (!pedido || !fila) return false;
  if (fila.includes(pedido)) return true;

  // A tolerancia acompanha o tamanho do nome, mas nunca chega a 2 edicoes:
  // com nome curto isso aceitaria "os" como MaxOS. Nomes de 4+ caracteres
  // ganham folga; o piso impede o casamento por acidente.
  const limite = Math.min(3, Math.max(1, Math.floor(fila.length * 0.3)));

  if (pedido.length < 4) return false;
  if (Math.abs(fila.length - pedido.length) > limite) return false;

  const custo = distanciaEdicao(pedido, fila);

  // Nome curto aceita so 1 erro. Nome longo tolera 2 ou 3, que e o que o
  // Whisper produz ("MaxiCote" x "MaxCheckout" = 3 edicoes em 11 letras).
  const maximo = fila.length >= 9 ? limite : 1;

  return custo <= maximo;
};

export interface ResultadoRota {
  /** texto que vai realmente para o WhatsApp, sem o marcador */
  texto: string;
  /** nome de fila pedido pela IA, quando houver */
  nomeSolicitado: string | null;
  /** fila encontrada na empresa, quando o nome bater */
  fila: Queue | null;
}

/**
 * Diz se a fila atual do ticket é a Triagem.
 * Só a Triagem pode trocar de fila: um prompt de produto que vazasse um
 * marcador (ou um cliente que escrevesse um) não pode mover o ticket.
 */
export const ehFilaTriagem = async (queueId: number): Promise<boolean> => {
  if (!queueId) return false;

  const fila = await Queue.findByPk(queueId, { attributes: ["id", "name"] });
  return normalizarNome(fila?.name || "") === "triagem";
};

/**
 * Tira o marcador e a formatação que o modelo coloca em volta dele.
 * O modelo as vezes envolve a marcação em crases: "`[[ROTA:MaxGas]]`",
 * e o que sobra dessa formatação não pode chegar ao cliente.
 */
export const limparMarcacao = (reply: string): string =>
  String(reply || "")
    .replace(MARCADOR_ROTA, "")
    .replace(/`+/g, "")
    .replace(/\*\*\*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

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

  // Depois de tirar o marcador sobra formatação que o modelo coloca em volta
  // dele, como crases. Limpa para o cliente não receber resíduo de marcação.
  const limpo = limparMarcacao(texto);

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

  // Nome exato primeiro, depois o mais parecido. A similaridade cobre o que
  // a transcricao do Whisper estraga ("MaxiCote", "MaxGass"), que o
  // includes sozinho nao resolvia.
  const nomes = lista.map((fila) => ({ fila, nome: normalizarNome(fila.name) }));

  const exata = nomes.find((n) => n.nome === alvo);

  const encontrada =
    exata?.fila ||
    nomes
      .filter((n) => pareceNomeDeFila(alvo, n.nome))
      // A mais parecida vence, para o nome ficar unico mesmo com dois candidatos.
      .sort((a, b) => distanciaEdicao(alvo, a.nome) - distanciaEdicao(alvo, b.nome))[0]
      ?.fila ||
    null;

  if (!exata && encontrada) {
    logger.info(
      `[ROTA] "${nomeSolicitado}" foi entendido como "${encontrada.name}"`
    );
  }

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