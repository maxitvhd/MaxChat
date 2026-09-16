import ScheduledMessagesEnvio from "../../models/ScheduledMessagesEnvio";
import AppError from "../../errors/AppError";

const DeleteService = async (id: string | number, companyId: number, key: string): Promise<void> => {
  const schedule = await ScheduledMessagesEnvio.findOne({ where: { id: Number(id), companyId, key } });

  if (!schedule) throw new AppError("ERR_NO_SCHEDULE_FOUND", 404);

  await schedule.destroy();
};

export default DeleteService;
