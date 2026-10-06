/**
 * @TercioSantos-0 |
 * services/AiServices/VoiceAgentTools |
 * @descrição: as ações que o agente de voz pode executar no painel.
 *
 *              Duas famílias, separadas de propósito:
 *              - somenteLeitura: consultam e respondem, rodam sem confirmação;
 *              - escrita: mexe em ticket (mover, atribuir, fechar, responder)
 *                e SEMPRE devolvem um pedido de confirmação. Quem confirma
 *                é o backend no endpoint /voice-agent/confirm, com o
 *                companyId do token: o modelo nunca escolhe a empresa.
 *
 *              Toda consulta filtra por companyId vindo do chamador, então o
 *              agente não enxerga ticket de outra empresa mesmo que peça.
 */
import { Op } from "sequelize";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";
import User from "../../models/User";
import logger from "../../utils/logger";

export type CategoriaFerramenta = "leitura" | "escrita";

export interface ContextoAgente {
  companyId: number;
  userId: number;
  /** permite responder pelo robô de uma fila específica */
  podeEscrever: boolean;
}

export interface ResultadoAcao {
  /** texto que o agente vai falar/leitura da tela */
  fala: string;
  /** dados estruturados para a tela do painel */
  dados?: unknown;
  /** true quando a ação precisa de "sim/não" antes de rodar */
  precisaConfirmacao?: boolean;
  /** confirmação pendente: se reenviar o mesmo comando, não duplica a ação */
  chave?: string;
  /**
   * true só quando a alteração aconteceu de fato. Ausente nas leituras e
   * false quando expirou/recusou, para a UI não anunciar sucesso à toa.
   */
  executou?: boolean;
}

export interface DefinicaoFerramenta {
  /** nome exato que o modelo chama */
  nome: string;
  categoria: CategoriaFerramenta;
  descricao: string;
  /** formato OpenAI function-calling */
  schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  executar: (args: any, ctx: ContextoAgente) => Promise<ResultadoAcao>;
}

const ORDEM_STATUS: Record<string, number> = {
  pendente: 0,
  andamento: 1,
  aberto: 1,
  aguardando: 2
};

/** Ticket visível para a empresa, sem o atendente logado. */
const ticketDaEmpresa = (ctx: ContextoAgente, ticketId: number) =>
  Ticket.findOne({ where: { id: ticketId, companyId: ctx.companyId } });

const falhar = (fala: string): ResultadoAcao => ({ fala });

// ------------------------------------------------------------------ leitura

const resumoDashboard: DefinicaoFerramenta = {
  nome: "dashboard_resumo",
  categoria: "leitura",
  descricao:
    "Resumo do dia: tickets abertos, fechados, em espera e tempo médio de resposta.",
  schema: { type: "object", properties: {} },
  executar: async (_args, ctx) => {
    const [abertos, emEspera, fechadosHoje] = await Promise.all([
      Ticket.count({
        where: {
          companyId: ctx.companyId,
          status: { [Op.in]: ["pendente", "andamento"] }
        }
      }),
      Ticket.count({
        where: { companyId: ctx.companyId, status: "aguardando" }
      }),
      // Tickets nao tem coluna de fechamento; o status muda em updatedAt.
      Ticket.count({
        where: {
          companyId: ctx.companyId,
          status: "fechado",
          updatedAt: { [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)) }
        }
      })
    ]);

    const esperaMs = await Ticket.findOne({
      where: { companyId: ctx.companyId },
      order: [["createdAt", "DESC"]],
      attributes: ["createdAt"]
    });

    return {
      fala: `Hoje você tem ${abertos} ticket(s) em aberto, ${emEspera} aguardando e ${fechadosHoje} fechado(s).`,
      dados: {
        abertos,
        emEspera,
        fechadosHoje,
        ultimoTicketEm: esperaMs?.createdAt ?? null
      }
    };
  }
};

const ticketConsultar: DefinicaoFerramenta = {
  nome: "ticket_consultar",
  categoria: "leitura",
  descricao:
    "Dados de um ticket pelo número. Aceita número do ticket ou texto com o número do cliente.",
  schema: {
    type: "object",
    properties: {
      ticketId: { type: "integer", description: "ID interno do ticket" },
      telefone: {
        type: "string",
        description: "Telefone do cliente, com ou sem DDI"
      }
    }
  },
  executar: async (args, ctx) => {
    let ticket: Ticket;

    if (args.ticketId) {
      ticket = await ticketDaEmpresa(ctx, Number(args.ticketId));
    } else if (args.telefone) {
      // somente os últimos 9 dígitos casam: o mesmo cliente aparece com e
      // sem o prefixo 55 dependendo de como gravou o número
      const digitos = String(args.telefone).replace(/\D/g, "");
      const sufixo = digitos.slice(-9);
      if (sufixo.length < 8)
        return falhar("Não consegui identificar esse telefone.");

      const contato = await Contact.findOne({
        where: {
          companyId: ctx.companyId,
          number: { [Op.like]: `%${sufixo}` }
        }
      });
      if (!contato) return falhar("Não achei contato com esse número.");
      ticket = await Ticket.findOne({
        where: { companyId: ctx.companyId, contactId: contato.id }
      });
    } else {
      return falhar("Me diga o número do ticket ou o telefone do cliente.");
    }

    if (!ticket) return falhar("Não achei esse ticket na sua empresa.");

    const contato = await Contact.findByPk(ticket.contactId);
    const fila = ticket.queueId ? await Queue.findByPk(ticket.queueId) : null;
    const mensagens = await Message.count({ where: { ticketId: ticket.id } });

    return {
      fala: `Ticket ${ticket.id}, do ${contato?.name ?? "cliente"}, na fila ${
        fila?.name ?? "sem fila"
      }, situação ${ticket.status}, com ${mensagens} mensagem(ns).`,
      dados: {
        id: ticket.id,
        cliente: contato?.name ?? null,
        telefone: contato?.number ?? null,
        fila: fila?.name ?? null,
        status: ticket.status,
        mensagens,
        criadoEm: ticket.createdAt
      }
    };
  }
};

const ticketListar: DefinicaoFerramenta = {
  nome: "ticket_listar",
  categoria: "leitura",
  descricao:
    "Lista os tickets abertos ou em espera, opcionalmente de uma fila.",
  schema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        description:
          "pendente, andamento, aguardando ou fechado. Vazio = pendente e andamento"
      },
      filaId: { type: "integer", description: "Fila específica" },
      limite: { type: "integer", description: "Quantos listar (padrão 5)" }
    }
  },
  executar: async (args, ctx) => {
    const limite = Math.min(Number(args.limite ?? 5) || 5, 20);
    const statusPedido = String(args.status ?? "").toLowerCase();
    const status = statusPedido
      ? [statusPedido]
      : ["pendente", "andamento", "aguardando"];

    const tickets = await Ticket.findAll({
      where: {
        companyId: ctx.companyId,
        ...(args.filaId ? { queueId: Number(args.filaId) } : {}),
        status: { [Op.in]: status }
      },
      order: [["updatedAt", "DESC"]],
      limit: limite,
      include: [
        { model: Contact, as: "contact", attributes: ["name", "number"] },
        { model: Queue, as: "queue", attributes: ["name"] }
      ]
    });

    if (!tickets.length)
      return { fala: "Não há tickets nessa situação.", dados: [] };

    const lista = tickets
      .map(
        t =>
          `${t.id}. ${(t as any).contact?.name ?? "cliente"} — ${
            (t as any).queue?.name ?? "sem fila"
          } (${t.status})`
      )
      .join(". ");

    return { fala: `${tickets.length} ticket(s): ${lista}.`, dados: tickets };
  }
};

const filasListar: DefinicaoFerramenta = {
  nome: "filas_listar",
  categoria: "leitura",
  descricao: "Lista as filas (produtos) da empresa com o ID de cada uma.",
  schema: { type: "object", properties: {} },
  executar: async (_args, ctx) => {
    const filas = await Queue.findAll({
      where: { companyId: ctx.companyId },
      attributes: ["id", "name"],
      order: [["name", "ASC"]]
    });

    if (!filas.length) return { fala: "Nenhuma fila cadastrada.", dados: [] };

    return {
      fala: `Suas filas: ${filas.map(f => `${f.name} (${f.id})`).join(", ")}.`,
      dados: filas
    };
  }
};

const conhecimentoBuscar: DefinicaoFerramenta = {
  nome: "conhecimento_buscar",
  categoria: "leitura",
  descricao:
    "Procura resposta na base de conhecimento da empresa. Use antes de dizer que não sabe.",
  schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "O que você quer saber" },
      filaId: { type: "integer", description: "Fila para restringir a busca" }
    }
  },
  executar: async (args, ctx) => {
    if (!args.query?.trim()) return falhar("Diga o que quer procurar.");

    // Import tardio: o painel de voz não deve carregar a ingestão de PDF.
    const { recuperarConhecimento } = await import(
      "./KnowledgeRetrievalService"
    );
    const ShowAi = (
      await import(
        "../AiProviderSettingsServices/ShowAiProviderSettingsService"
      )
    ).default;

    const settings = (
      await ShowAi({ companyId: ctx.companyId })
    ).toJSON() as any;

    const r = await recuperarConhecimento(
      { settings, companyId: ctx.companyId, queueId: args.filaId ?? null },
      String(args.query).trim()
    );

    if (!r.total) {
      return { fala: "Não achei nada sobre isso na base de conhecimento." };
    }
    return { fala: r.contexto, dados: { trechos: r.total } };
  }
};

// ------------------------------------------------------------------- escrita

/** Todas as escritas exigem confirmationKey: o backend revalida no confirm. */
const comConfirmacao = (
  chave: string,
  fala: string,
  dados?: unknown
): ResultadoAcao => ({
  fala,
  dados,
  precisaConfirmacao: true,
  chave
});

const ticketMoverFila: DefinicaoFerramenta = {
  nome: "ticket_mover_fila",
  categoria: "escrita",
  descricao: "Move um ticket para outra fila (setor).",
  schema: {
    type: "object",
    properties: {
      ticketId: { type: "integer", description: "ID do ticket" },
      filaId: { type: "integer", description: "ID da fila de destino" }
    }
  },
  executar: async (args, ctx) => {
    if (!ctx.podeEscrever) return falhar("Você não pode alterar tickets.");
    const ticket = await ticketDaEmpresa(ctx, Number(args.ticketId));
    if (!ticket) return falhar("Ticket não encontrado.");

    const fila = await Queue.findOne({
      where: { id: Number(args.filaId), companyId: ctx.companyId }
    });
    if (!fila) return falhar("Fila de destino não encontrada.");

    return comConfirmacao(
      `mover:${ticket.id}:${fila.id}`,
      `Mover o ticket ${ticket.id} para a fila ${fila.name}?`,
      { ticketId: ticket.id, filaId: fila.id }
    );
  }
};

const ticketAtribuir: DefinicaoFerramenta = {
  nome: "ticket_atribuir",
  categoria: "escrita",
  descricao: "Atribui um ticket a um atendente da empresa.",
  schema: {
    type: "object",
    properties: {
      ticketId: { type: "integer", description: "ID do ticket" },
      userId: { type: "integer", description: "ID do atendente" }
    }
  },
  executar: async (args, ctx) => {
    if (!ctx.podeEscrever) return falhar("Você não pode alterar tickets.");
    const ticket = await ticketDaEmpresa(ctx, Number(args.ticketId));
    if (!ticket) return falhar("Ticket não encontrado.");

    const atendente = await User.findOne({
      where: { id: Number(args.userId), companyId: ctx.companyId }
    });
    if (!atendente) return falhar("Atendente não encontrado.");

    return comConfirmacao(
      `atribuir:${ticket.id}:${atendente.id}`,
      `Atribuir o ticket ${ticket.id} para ${atendente.name}?`,
      { ticketId: ticket.id, userId: atendente.id }
    );
  }
};

const ticketFechar: DefinicaoFerramenta = {
  nome: "ticket_fechar",
  categoria: "escrita",
  descricao: "Fecha um ticket como resolvido.",
  schema: {
    type: "object",
    properties: { ticketId: { type: "integer", description: "ID do ticket" } }
  },
  executar: async (args, ctx) => {
    if (!ctx.podeEscrever) return falhar("Você não pode alterar tickets.");
    const ticket = await ticketDaEmpresa(ctx, Number(args.ticketId));
    if (!ticket) return falhar("Ticket não encontrado.");
    if (ticket.status === "fechado")
      return falhar(`O ticket ${ticket.id} já está fechado.`);

    return comConfirmacao(
      `fechar:${ticket.id}`,
      `Fechar o ticket ${ticket.id}?`,
      { ticketId: ticket.id }
    );
  }
};

const ticketEnviarMensagem: DefinicaoFerramenta = {
  nome: "ticket_enviar_mensagem",
  categoria: "escrita",
  descricao:
    "Envia uma mensagem para o cliente dentro do ticket, pelo robô da fila.",
  schema: {
    type: "object",
    properties: {
      ticketId: { type: "integer", description: "ID do ticket" },
      mensagem: { type: "string", description: "Texto a enviar ao cliente" }
    }
  },
  executar: async (args, ctx) => {
    if (!ctx.podeEscrever) return falhar("Você não pode enviar mensagens.");
    const ticket = await ticketDaEmpresa(ctx, Number(args.ticketId));
    if (!ticket) return falhar("Ticket não encontrado.");
    if (!ticket.queueId) return falhar("Esse ticket não está em nenhuma fila.");

    const texto = String(args.mensagem ?? "").trim();
    if (!texto) return falhar("Diga o que devo enviar.");

    return comConfirmacao(
      `enviar:${ticket.id}:${texto.slice(0, 40)}`,
      `Enviar para o cliente do ticket ${ticket.id}: "${texto}"?`,
      { ticketId: ticket.id, mensagem: texto }
    );
  }
};

export const FERRAMENTAS: DefinicaoFerramenta[] = [
  resumoDashboard,
  ticketConsultar,
  ticketListar,
  filasListar,
  conhecimentoBuscar,
  ticketMoverFila,
  ticketAtribuir,
  ticketFechar,
  ticketEnviarMensagem
];

export const ferramentasPorNome = (
  nome: string
): DefinicaoFerramenta | undefined => FERRAMENTAS.find(f => f.nome === nome);

/** Nomes que o modelo pode chamar, com o schema no formato do Ollama. */
export const definicoesParaModelo = () =>
  FERRAMENTAS.map(f => ({
    type: "function" as const,
    function: {
      name: f.nome,
      description: f.descricao,
      parameters: f.schema
    }
  }));

// ------------------------------------------------------------- confirmação

/**
 * Ações de escrita ficam pendentes em memória até o /confirm. Não guardamos
 * o texto do modelo: só os parâmetros já validados, e a chave evita que o
 * mesmo comando vire duas ações.
 */
const pendentes = new Map<
  string,
  { companyId: number; userId: number; dados: any; expiraEm: number }
>();

const TTL_MS = 5 * 60 * 1000;

const limparPendentes = () => {
  const agora = Date.now();
  pendentes.forEach((v, k) => {
    if (v.expiraEm < agora) pendentes.delete(k);
  });
};

/**
 * A ação que este operador tem esperando "sim", se houver.
 *
 * Permite que o "sim" falado confirme sem passar pelo modelo: a chave foi
 * gerada na pergunta anterior, já expira sozinha e continua amarrada a
 * empresa + operador.
 */
export const pendenciaAtiva = (
  companyId: number,
  userId: number
): { chave: string } | null => {
  limparPendentes();
  for (const [chave, valor] of pendentes) {
    if (valor.companyId === companyId && valor.userId === userId) {
      return { chave };
    }
  }
  return null;
};

export const registrarPendente = (
  chave: string,
  companyId: number,
  userId: number,
  dados: unknown
): string => {
  limparPendentes();
  pendentes.set(chave, {
    companyId,
    userId,
    dados,
    expiraEm: Date.now() + TTL_MS
  });
  return chave;
};

export const consumirPendente = (
  chave: string,
  companyId: number,
  userId: number
): { dados: any } | null => {
  limparPendentes();
  const p = pendentes.get(chave);
  if (!p) return null;
  // Chave vale para a empresa E para o operador que pediu: outro login da
  // mesma empresa não confirma a ação de ninguém.
  if (p.companyId !== companyId || p.userId !== userId) return null;
  pendentes.delete(chave);
  return { dados: p.dados };
};

/** Descarta pendências quando o operador desiste ou troca de assunto. */
export const limparPendentesDoUsuario = (userId: number): void => {
  pendentes.forEach((v, k) => {
    if (v.userId === userId) pendentes.delete(k);
  });
};

/** Executa de fato a ação que estava esperando confirmação. */
export const confirmarAcao = async (
  chave: string,
  ctx: ContextoAgente
): Promise<ResultadoAcao> => {
  const p = consumirPendente(chave, ctx.companyId, ctx.userId);
  if (!p) {
    // Chave inválida/expirada não é sucesso: a UI não deve anunciar mudança.
    return {
      fala: "Essa ação expirou. Fale o comando de novo.",
      executou: false
    };
  }

  const { ticketId, filaId, userId, mensagem } = p.dados;

  try {
    if (chave.startsWith("mover:")) {
      const ticket = await ticketDaEmpresa(ctx, Number(ticketId));
      if (!ticket) return falhar("Ticket não encontrado.");
      ticket.queueId = Number(filaId);
      ticket.userId = ctx.userId;
      await ticket.save();

      const fila = await Queue.findByPk(Number(filaId));
      logger.info(
        `[VoiceAgent] ticket ${ticketId} movido para fila ${fila?.name}`
      );
      return {
        fala: `Pronto. Ticket ${ticketId} agora está na fila ${fila?.name}.`,
        executou: true
      };
    }

    if (chave.startsWith("atribuir:")) {
      const ticket = await ticketDaEmpresa(ctx, Number(ticketId));
      if (!ticket) return falhar("Ticket não encontrado.");
      ticket.userId = Number(userId);
      await ticket.save();

      const atendente = await User.findByPk(Number(userId));
      logger.info(
        `[VoiceAgent] ticket ${ticketId} atribuído a ${atendente?.name}`
      );
      return {
        fala: `Pronto. Ticket ${ticketId} atribuído para ${atendente?.name}.`,
        executou: true
      };
    }

    if (chave.startsWith("fechar:")) {
      const ticket = await ticketDaEmpresa(ctx, Number(ticketId));
      if (!ticket) return falhar("Ticket não encontrado.");
      ticket.status = "fechado";
      await ticket.save();
      logger.info(`[VoiceAgent] ticket ${ticketId} fechado`);
      return { fala: `Pronto. Ticket ${ticketId} fechado.`, executou: true };
    }

    if (chave.startsWith("enviar:")) {
      const ticket = await ticketDaEmpresa(ctx, Number(ticketId));
      if (!ticket?.queueId) return falhar("Ticket sem fila definida.");

      // mesmo caminho do POST /messages/:ticketId do painel, sem passar
      // pelo controller: evita depender de request/response aqui.
      const SendWhatsAppMessage = (
        await import("../WbotServices/SendWhatsAppMessage")
      ).default;
      const SetTicketMessagesAsRead = (
        await import("../../helpers/SetTicketMessagesAsRead")
      ).default;
      const { getIO } = await import("../../libs/socket");

      const completo = await Ticket.findOne({
        where: { id: ticket.id },
        include: [
          {
            model: Contact,
            as: "contact",
            attributes: ["id", "name", "number", "remoteJid", "profilePicUrl"]
          },
          {
            model: Queue,
            as: "queue",
            attributes: ["id", "name"],
            include: [
              {
                model: Whatsapp,
                as: "whatsapp",
                attributes: ["id", "name", "session"]
              }
            ]
          }
        ]
      });

      if (!completo?.channel)
        return falhar("Esse ticket não tem canal configurado.");
      if (completo.channel === "whatsapp") {
        SetTicketMessagesAsRead(completo);
      }

      if (completo.channel === "whatsapp") {
        await SendWhatsAppMessage({
          body: String(mensagem),
          ticket: completo,
          quotedMsg: undefined,
          vCard: undefined
        });
      } else {
        const sendFaceMessage = (
          await import("../FacebookServices/sendFacebookMessage")
        ).default;
        const { verifyMessageFace } = await import(
          "../FacebookServices/facebookMessageListener"
        );
        const enviada = await sendFaceMessage({
          body: String(mensagem),
          ticket: completo,
          quotedMsg: undefined
        });
        if (completo.channel === "facebook") {
          await verifyMessageFace(
            enviada,
            String(mensagem),
            completo,
            completo.contact,
            true
          );
        }
      }

      getIO()
        .of(`company-${ctx.companyId}`)
        .emit(`company-${ctx.companyId}-chat`, {
          action: "update",
          ticketId: ticket.id
        });

      logger.info(`[VoiceAgent] mensagem enviada no ticket ${ticketId}`);
      return { fala: "Pronto. Mensagem enviada ao cliente.", executou: true };
    }

    return falhar("Não entendi qual ação confirmar.");
  } catch (erro) {
    logger.error(
      `[VoiceAgent] falha ao confirmar ${chave}: ${(erro as Error).message}`
    );
    return falhar(`Não consegui concluir: ${(erro as Error).message}`);
  }
};

export { ORDEM_STATUS };
