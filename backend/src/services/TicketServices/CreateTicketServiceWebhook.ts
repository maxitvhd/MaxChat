import AppError from "../../errors/AppError";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import Ticket from "../../models/Ticket";
import { getIO } from "../../libs/socket";
import { consolidateAndFindContactTicket } from "./FindOrCreateTicketService";

interface Request {
  contactId: number;
  status: string;
  userId: number;
  companyId: number;
  queueId?: number;
  lastFlowId?: string;
  dataWebhook?: {};
  hashFlowId?: string;
  flowStopped?: string;
}

const CreateTicketServiceWebhook = async ({
  contactId,
  status,
  userId,
  queueId,
  companyId,
  lastFlowId,
  dataWebhook,
  hashFlowId,
  flowStopped
}: Request): Promise<Ticket> => {
  const defaultWhatsapp = await GetDefaultWhatsApp(undefined, companyId);

  const isGroup = false;

  // Reaproveita ou reabre a conversa existente do contato independentemente da conexão
  let { ticket: existingTicket } = await consolidateAndFindContactTicket(
    contactId,
    companyId,
    defaultWhatsapp.id
  );

  let id: number;
  if (existingTicket) {
    id = existingTicket.id;
  } else {
    const created = await Ticket.create({
      contactId,
      companyId,
      whatsappId: defaultWhatsapp.id,
      status,
      isGroup,
      userId,
      flowWebhook: true,
      dataWebhook: dataWebhook,
      hashFlowId: hashFlowId,
      flowStopped: flowStopped
    });
    id = created.id;
  }

  await Ticket.update(
    {
      companyId,
      queueId,
      userId,
      whatsappId: defaultWhatsapp.id,
      status: "open",
      flowWebhook: true,
      lastFlowId: lastFlowId,
      flowStopped: flowStopped
    },
    { where: { id } }
  );

  const ticket = await Ticket.findByPk(id, { include: ["contact", "queue"] });

  if (!ticket) {
    throw new AppError("ERR_CREATING_TICKET");
  }

  const io = getIO();

  io.to(ticket.id.toString()).emit("ticket", {
    action: "update",
    ticket
  });

  return ticket;
};

export default CreateTicketServiceWebhook;
