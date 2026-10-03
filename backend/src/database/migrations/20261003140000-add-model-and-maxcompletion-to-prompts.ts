import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table = "Prompts";
    const colunas: any = await queryInterface.describeTable(table).catch(() => ({}));

    if (!colunas.model) {
      await queryInterface.addColumn(table, "model", {
        type: DataTypes.STRING,
        allowNull: true
      });
    }

    if (!colunas.max_completion_tokens) {
      await queryInterface.addColumn(table, "max_completion_tokens", {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      });
    }

    if (!colunas.replyEngine) {
      await queryInterface.addColumn(table, "replyEngine", {
        type: DataTypes.STRING,
        allowNull: true
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const table = "Prompts";
    const colunas: any = await queryInterface.describeTable(table).catch(() => ({}));

    if (colunas.model) {
      await queryInterface.removeColumn(table, "model");
    }
    if (colunas.max_completion_tokens) {
      await queryInterface.removeColumn(table, "max_completion_tokens");
    }
    if (colunas.replyEngine) {
      await queryInterface.removeColumn(table, "replyEngine");
    }
  }
};
