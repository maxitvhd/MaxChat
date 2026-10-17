import AppError from "../../errors/AppError";
import Campaign from "../../models/Campaign";
import ContactList from "../../models/ContactList";
import Queue from "../../models/Queue";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";

// Converte o id vindo do front; vazio/null/0 vira null (sem FK)
const toIdOuNull = (valor: any): number | null => {
  const n = Number(valor);
  return valor === null || valor === undefined || valor === "" || !n ? null : n;
};

interface Data {
  id: number | string;
  name: string;
  status: string;
  confirmation: boolean;
  scheduledAt: string;
  companyId: number;
  contactListId: number;
  message1?: string;
  message2?: string;
  message3?: string;
  message4?: string;
  message5?: string;
  confirmationMessage1?: string;
  confirmationMessage2?: string;
  confirmationMessage3?: string;
  confirmationMessage4?: string;
  confirmationMessage5?: string;
  userId: number | string;
  queueId: number | string;
  statusTicket: string;
  openTicket: string;
}

const UpdateService = async (data: Data): Promise<Campaign> => {
  const { id } = data;

  const record = await Campaign.findByPk(id);

  if (!record) {
    throw new AppError("ERR_NO_CAMPAIGN_FOUND", 404);
  }

  // Campanha já finalizada volta a ser rascunho: o texto pode ser ajustado
  // e, se tiver data nova, ela vira PROGRAMADA logo abaixo
  if (record.status === "FINALIZADA") {
    data.status = "INATIVA";
  }

  if (["INATIVA", "PROGRAMADA", "CANCELADA"].indexOf(data.status) === -1) {
    throw new AppError(
      "Só é permitido alterar campanha Inativa e Programada",
      400
    );
  }

  // Só vira PROGRAMADA com data futura; uma data que já passou deixa de ser
  // agendamento (o agendador nunca pegaria essa campanha)
  if (
    data.scheduledAt != null &&
    data.scheduledAt != "" &&
    data.status === "INATIVA" &&
    new Date(data.scheduledAt) > new Date()
  ) {
    data.status = "PROGRAMADA";
  }

  await record.update({
    ...data,
    id: Number(data.id),
    // Number(null) vira 0 e quebra a FK; sem usuário/fila escolhido fica null
    userId: toIdOuNull(data.userId),
    queueId: toIdOuNull(data.queueId),
    scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined
  });

  await record.reload({
    include: [
      { model: ContactList },
      { model: Whatsapp, attributes: ["id", "name"] },
      { model: User, attributes: ["id", "name"] },
      { model: Queue, attributes: ["id", "name"] },
    ]
  });

  return record;
};

export default UpdateService;
