import { Op } from "sequelize";

import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import ShowTicketService from "./ShowTicketService";
import { isNil } from "lodash";
import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";
import Whatsapp from "../../models/Whatsapp";
import CreateLogTicketService from "./CreateLogTicketService";

// Consolida tickets ativos duplicados do mesmo contato na empresa (sem apagar registros do banco)
// e retorna o ticket ativo ou o último ticket fechado para ser reaberto, independentemente da conexão/origem
export const consolidateAndFindContactTicket = async (
  contactId: number,
  companyId: number,
  preferredWhatsappId?: number
): Promise<{ ticket: Ticket | null; wasReopened: boolean }> => {
  const io = getIO();

  const activeTickets = await Ticket.findAll({
    where: {
      status: {
        [Op.or]: ["open", "pending", "group", "nps", "lgpd"]
      },
      contactId,
      companyId
    },
    order: [
      ["updatedAt", "DESC"],
      ["id", "DESC"]
    ]
  });

  if (activeTickets.length > 0) {
    // Prioriza ticket em atendimento ("open"), depois o que já tem whatsappId/fila e atualização mais recente
    activeTickets.sort((a, b) => {
      const aOpen = a.status === "open" ? 1 : 0;
      const bOpen = b.status === "open" ? 1 : 0;
      if (aOpen !== bOpen) return bOpen - aOpen;

      const aHasWpp = !isNil(a.whatsappId) ? 1 : 0;
      const bHasWpp = !isNil(b.whatsappId) ? 1 : 0;
      if (aHasWpp !== bHasWpp) return bHasWpp - aHasWpp;

      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;

      return b.id - a.id;
    });

    const primaryTicket = activeTickets[0];
    const duplicates = activeTickets.slice(1);

    // Se havia mais de uma conversa aberta/pendente para o mesmo contato, unifica as mensagens
    // na conversa principal e fecha as duplicadas sem excluir nada do banco
    for (const dup of duplicates) {
      try {
        await Message.update(
          { ticketId: primaryTicket.id },
          { where: { ticketId: dup.id, companyId } }
        );
        if (!primaryTicket.queueId && dup.queueId) {
          await primaryTicket.update({ queueId: dup.queueId });
        }
        if (!primaryTicket.userId && dup.userId) {
          await primaryTicket.update({ userId: dup.userId });
        }
        await dup.update({ status: "closed", unreadMessages: 0 });
        io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
          action: "delete",
          ticketId: dup.id
        });
      } catch (err) {
        logger.warn(`Erro ao consolidar ticket duplicado ${dup.id} -> ${primaryTicket.id}: ${err}`);
      }
    }

    return { ticket: primaryTicket, wasReopened: false };
  }

  // Se não há ticket ativo, busca a última conversa do contato na empresa (independentemente de whatsappId ou tempo)
  const lastTicket = await Ticket.findOne({
    where: {
      contactId,
      companyId
    },
    order: [
      ["updatedAt", "DESC"],
      ["id", "DESC"]
    ]
  });

  if (lastTicket) {
    return { ticket: lastTicket, wasReopened: true };
  }

  return { ticket: null, wasReopened: false };
};

const FindOrCreateTicketService = async (
  contact: Contact,
  whatsapp: Whatsapp,
  unreadMessages: number,
  companyId: number,
  queueId: number = null,
  userId: number = null,
  groupContact?: Contact,
  channel?: string,
  isImported?: boolean,
  isForward?: boolean,
  settings?: any,
  isTransfered?: boolean,
  isCampaign: boolean = false
): Promise<Ticket> => {
  let openAsLGPD = false;
  if (settings?.enableLGPD) {
    openAsLGPD =
      !isCampaign &&
      !isTransfered &&
      settings.enableLGPD === "enabled" &&
      settings.lgpdMessage !== "" &&
      (settings.lgpdConsent === "enabled" ||
        (settings.lgpdConsent === "disabled" && isNil(contact?.lgpdAcceptedAt)));
  }

  const io = getIO();
  const DirectTicketsToWallets = settings?.DirectTicketsToWallets;
  const targetContactId = groupContact ? groupContact.id : contact.id;

  let { ticket, wasReopened } = await consolidateAndFindContactTicket(
    targetContactId,
    companyId,
    whatsapp?.id
  );

  // Caso 1: Já existe uma conversa ativa para esse contato — reaproveita a mesma conversa
  if (ticket && !wasReopened) {
    const updatePayload: any = {};

    if (whatsapp?.id && ticket.whatsappId !== whatsapp.id) {
      updatePayload.whatsappId = whatsapp.id;
    }

    if (isCampaign) {
      updatePayload.userId = userId !== ticket.userId ? ticket.userId : userId;
      updatePayload.queueId = queueId !== ticket.queueId ? ticket.queueId : queueId;
    } else {
      updatePayload.unreadMessages = unreadMessages;
      updatePayload.isBot = false;
      if (queueId != 0 && !isNil(queueId) && isNil(ticket.queueId)) {
        updatePayload.queueId = queueId;
      }
      if (userId != 0 && !isNil(userId) && isNil(ticket.userId)) {
        updatePayload.userId = userId;
      }
    }

    await ticket.update(updatePayload);
    ticket = await ShowTicketService(ticket.id, companyId);

    io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
      action: "update",
      ticket
    });

    return ticket;
  }

  // Define o status padrão de abertura/reabertura
  let targetStatus =
    !isImported && !isNil(settings?.enableLGPD) && openAsLGPD && !groupContact
      ? "lgpd"
      : whatsapp?.groupAsTicket === "enabled" || !groupContact
      ? "pending"
      : "group";

  let targetUserId: number | null = userId != 0 && !isNil(userId) ? userId : null;
  let targetQueueId: number | null = queueId != 0 && !isNil(queueId) ? queueId : null;

  if (DirectTicketsToWallets && contact.id) {
    const wallet: any = contact;
    const wallets = await wallet.getWallets();
    if (wallets && wallets[0]?.id) {
      targetStatus =
        !isImported && !isNil(settings?.enableLGPD) && openAsLGPD && !groupContact
          ? "lgpd"
          : whatsapp?.groupAsTicket === "enabled" || !groupContact
          ? "open"
          : "group";
      targetUserId = wallets[0].id;
    }
  }

  // Caso 2: O contato já tinha uma conversa anterior (fechada) — reabre a mesma conversa independentemente de onde chamou
  if (ticket && wasReopened) {
    await ticket.update({
      status: targetStatus,
      unreadMessages,
      whatsappId: whatsapp?.id || ticket.whatsappId,
      companyId,
      isGroup: !!groupContact,
      isBot: groupContact ? false : true,
      channel: channel || whatsapp?.channel || ticket.channel || "whatsapp",
      userId: targetUserId,
      queueId: targetQueueId,
      amountUsedBotQueues: 0,
      amountUsedBotQueuesNPS: 0,
      sendInactiveMessage: false,
      isActiveDemand: false,
      flowWebhook: false,
      lastFlowId: null,
      hashFlowId: null,
      flowStopped: null
    });

    ticket = await ShowTicketService(ticket.id, companyId);

    io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
      action: "update",
      ticket
    });

    await CreateLogTicketService({
      ticketId: ticket.id,
      type: openAsLGPD ? "lgpd" : "reopen"
    });

    return ticket;
  }

  // Caso 3: Primeiro contato da história desse cliente na empresa — cria a conversa única
  const ticketData: any = {
    contactId: targetContactId,
    status: targetStatus,
    isGroup: !!groupContact,
    unreadMessages,
    whatsappId: whatsapp?.id,
    companyId,
    isBot: groupContact ? false : true,
    channel: channel || whatsapp?.channel || "whatsapp",
    imported: isImported ? new Date() : null,
    isActiveDemand: false,
    ...(targetUserId ? { userId: targetUserId } : {}),
    ...(targetQueueId ? { queueId: targetQueueId } : {})
  };

  ticket = await Ticket.create(ticketData);

  ticket = await ShowTicketService(ticket.id, companyId);

  io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
    action: "update",
    ticket
  });

  await CreateLogTicketService({
    ticketId: ticket.id,
    type: openAsLGPD ? "lgpd" : "create"
  });

  return ticket;
};

export default FindOrCreateTicketService;