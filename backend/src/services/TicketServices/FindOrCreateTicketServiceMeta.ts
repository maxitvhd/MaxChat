import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import ShowTicketService from "./ShowTicketService";
import FindOrCreateATicketTrakingService from "./FindOrCreateATicketTrakingService";
import { consolidateAndFindContactTicket } from "./FindOrCreateTicketService";

const FindOrCreateTicketServiceMeta = async (
  contact: Contact,
  whatsappId: number,
  unreadMessages: number,
  companyId: number,
  channel: string
): Promise<Ticket> => {
  let { ticket, wasReopened } = await consolidateAndFindContactTicket(
    contact.id,
    companyId,
    whatsappId
  );

  if (ticket) {
    await ticket.update({
      status: wasReopened ? "pending" : ticket.status,
      ...(wasReopened ? { userId: null } : {}),
      unreadMessages,
      whatsappId,
      companyId,
      channel
    });

    await FindOrCreateATicketTrakingService({
      ticketId: ticket.id,
      companyId,
      whatsappId,
      userId: ticket.userId
    });
  } else {
    ticket = await Ticket.create({
      contactId: contact.id,
      status: "pending",
      isGroup: false,
      unreadMessages,
      whatsappId,
      companyId,
      channel,
      isActiveDemand: false
    });

    await FindOrCreateATicketTrakingService({
      ticketId: ticket.id,
      companyId,
      whatsappId,
      userId: ticket.userId
    });
  }

  ticket = await ShowTicketService(ticket.id, companyId);

  return ticket;
};

export default FindOrCreateTicketServiceMeta;
