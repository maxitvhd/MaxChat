import AppError from "../../errors/AppError";

import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import GetDefaultWhatsAppByUser from "../../helpers/GetDefaultWhatsAppByUser";
import Ticket from "../../models/Ticket";
import ShowContactService from "../ContactServices/ShowContactService";
import { getIO } from "../../libs/socket";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";

import CreateLogTicketService from "./CreateLogTicketService";
import ShowTicketService from "./ShowTicketService";
import { consolidateAndFindContactTicket } from "./FindOrCreateTicketService";

interface Request {
  contactId: number;
  status: string;
  userId: number;
  companyId: number;
  queueId?: number;
  whatsappId: string;
}

const CreateTicketService = async ({
  contactId,
  status,
  userId,
  queueId,
  companyId,
  whatsappId = ""
}: Request): Promise<Ticket> => {

  const io = getIO();

  let whatsapp;
  let defaultWhatsapp;

  if (whatsappId !== "undefined" && whatsappId !== null && whatsappId !== "") {
    whatsapp = await ShowWhatsAppService(whatsappId, companyId);
  }

  defaultWhatsapp = await GetDefaultWhatsAppByUser(userId);

  if (whatsapp) {
    defaultWhatsapp = whatsapp;
  }
  if (!defaultWhatsapp) {
    defaultWhatsapp = await GetDefaultWhatsApp(whatsapp?.id, companyId);
  }

  const { isGroup } = await ShowContactService(contactId, companyId);

  // Busca qualquer conversa existente desse contato (ativa ou fechada, de qualquer conexão)
  // e consolida eventuais duplicadas para sempre reabrir a mesma conversa
  let { ticket, wasReopened } = await consolidateAndFindContactTicket(
    contactId,
    companyId,
    defaultWhatsapp.id
  );

  if (ticket) {
    await ticket.update({
      companyId,
      whatsappId: defaultWhatsapp.id,
      channel: defaultWhatsapp.channel,
      isGroup,
      userId: userId || ticket.userId,
      queueId: queueId || ticket.queueId,
      status: isGroup ? "group" : "open",
      isBot: false,
      isActiveDemand: true
    });
  } else {
    ticket = await Ticket.create({
      contactId,
      companyId,
      whatsappId: defaultWhatsapp.id,
      channel: defaultWhatsapp.channel,
      isGroup,
      userId,
      isBot: true,
      queueId,
      status: isGroup ? "group" : "open",
      isActiveDemand: true
    });
  }

  ticket = await ShowTicketService(ticket.id, companyId);

  if (!ticket) {
    throw new AppError("ERR_CREATING_TICKET");
  }

  io.of(String(companyId))
    .emit(`company-${companyId}-ticket`, {
      action: "update",
      ticket
    });

  await CreateLogTicketService({
    userId,
    queueId,
    ticketId: ticket.id,
    type: wasReopened ? "reopen" : "create"
  });

  return ticket;
};

export default CreateTicketService;
