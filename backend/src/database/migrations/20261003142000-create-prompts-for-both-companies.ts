import { QueryInterface, QueryTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      const companies: any[] = await queryInterface.sequelize.query(
        'SELECT id FROM "Companies" ORDER BY id;',
        { type: QueryTypes.SELECT }
      );

      for (const comp of companies) {
        const queues: any[] = await queryInterface.sequelize.query(
          `SELECT id, name FROM "Queues" WHERE "companyId" = :companyId ORDER BY id`,
          {
            type: QueryTypes.SELECT,
            replacements: { companyId: comp.id }
          }
        );

        for (const queue of queues) {
          const exists: any[] = await queryInterface.sequelize.query(
            `SELECT id FROM "Prompts" WHERE "companyId" = :companyId AND "queueId" = :queueId LIMIT 1`,
            {
              type: QueryTypes.SELECT,
              replacements: { companyId: comp.id, queueId: queue.id }
            }
          );

          if (exists.length === 0) {
            await queryInterface.sequelize.query(
              `INSERT INTO "Prompts" ("name", "prompt", "apiKey", "queueId", "companyId", "maxMessages", "maxTokens", "temperature", "replyEngine", "model", "max_completion_tokens", "voice", "voiceKey", "voiceRegion", "promptTokens", "completionTokens", "totalTokens", "createdAt", "updatedAt")
               VALUES (:name, :prompt, :apiKey, :queueId, :companyId, 10, 2000, 0.5, 'default', NULL, 0, NULL, NULL, NULL, 0, 0, 0, NOW(), NOW())`,
              {
                replacements: {
                  name: `Prompt - ${queue.name}`,
                  prompt: "Você é um assistente útil e preciso. Responda de forma clara e objetiva.",
                  apiKey: "",
                  queueId: queue.id,
                  companyId: comp.id
                }
              }
            );
          }
        }
      }
    } catch (e) {
      // ignora
    }
  },
  down: async (_queryInterface: QueryInterface) => {}
};
