import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`
      UPDATE "Prompts"
      SET "replyEngine" = COALESCE("replyEngine", 'default'),
          "model" = COALESCE("model", '')
      WHERE "replyEngine" IS NULL OR "model" IS NULL;
    `);
  },
  down: async (_queryInterface: QueryInterface) => {}
};
