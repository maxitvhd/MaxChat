import Ticket from "../../models/Ticket";
import AppError from "../../errors/AppError";
import { getIO } from "../../libs/socket";

const DeleteTicketService = async (id: string, userId: string, companyId: number): Promise<Ticket> => {
  const ticket = await Ticket.findOne({
    where: { id, companyId }
  });

  if (!ticket) {
    throw new AppError("ERR_NO_TICKET_FOUND", 404);
  }

  const allContactTickets = await Ticket.findAll({
    where: {
      contactId: ticket.contactId,
      companyId: ticket.companyId
    },
    attributes: ["id"]
  });

  // Remove todos os tickets vinculados a esse contato na empresa para que registros
  // anteriores agrupados na mesma conversa não reapareçam ao dar F5
  await Ticket.destroy({
    where: {
      contactId: ticket.contactId,
      companyId: ticket.companyId
    }
  });

  const io = getIO();
  for (const t of allContactTickets) {
    io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
      action: "delete",
      ticketId: t.id
    });
  }

  return ticket;
};

export default DeleteTicketService;
