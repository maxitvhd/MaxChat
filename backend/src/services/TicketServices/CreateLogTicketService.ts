// import AppError from "../../errors/AppError";
// import socketEmit from "../../helpers/socketEmit";
import LogTicket from "../../models/LogTicket";

type logType =
  | "access"
  | "create"
  | "closed"
  | "transfered"
  | "receivedTransfer"
  | "open"
  | "reopen"
  | "pending"
  | "nps"
  | "lgpd"
  | "queue"
  | "userDefine"
  | "delete"
  | "chatBot"
  | "autoClose"
  | "retriesLimitQueue"
  | "retriesLimitUserDefine"
  | "redirect";

interface Request {
  type: logType;
  ticketId: number | string;
  userId?: number | string;
  queueId?: number | string;
}

const CreateLogTicketService = async ({
  type,
  userId,
  ticketId,
  queueId
}: Request): Promise<void> => {
  const validUserId =
    userId !== undefined && userId !== null && userId !== "" && Number(userId) > 0
      ? Number(userId)
      : undefined;
  const validQueueId =
    queueId !== undefined && queueId !== null && queueId !== "" && Number(queueId) > 0
      ? Number(queueId)
      : undefined;

  try {
    await LogTicket.create({
      type,
      ticketId: Number(ticketId),
      ...(validUserId ? { userId: validUserId } : {}),
      ...(validQueueId ? { queueId: validQueueId } : {})
    });
  } catch (err) {
    // Ignora falha de log para nunca travar fechamento/atualização de ticket
  }
};

export default CreateLogTicketService;
