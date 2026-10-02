/**
 * Complemento da migration create-AiProviderSettings.
 *
 * Adiciona as colunas que surgiram depois do primeiro deploy do módulo:
 *   - jevQuestions    : spec de perguntas do JEV (contrato SystemOne)
 *   - embeddingModel  : modelo de embedding (Ollama) da memória
 *   - memoryCollection: slug da coleção de memória da empresa
 *
 * Idempotente: pode rodar em base nova ou em base que já tem a tabela.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const existeTabela = await queryInterface.sequelize
      .getQueryInterface()
      .showAllTables();
    const lista = (existeTabela as unknown as { tableName: string }[]).map(t =>
      typeof t === "string" ? t : t.tableName
    );

    if (!lista.includes("AiProviderSettings")) return;

    const colunas = await queryInterface.describeTable("AiProviderSettings");

    const novas: Array<{
      nome: string;
      tipo: "TEXT" | "STRING";
      padrao: string | null;
    }> = [
      { nome: "jevQuestions", tipo: "TEXT", padrao: null },
      { nome: "embeddingModel", tipo: "STRING", padrao: "nomic-embed-text" },
      { nome: "memoryCollection", tipo: "STRING", padrao: "memoria" }
    ];

    // Roda em sequência: cada addColumn depende do anterior.
    await novas.reduce(async (anterior, { nome, tipo, padrao }) => {
      await anterior;
      if (colunas[nome]) return;
      await queryInterface.addColumn("AiProviderSettings", nome, {
        type: Sequelize[tipo],
        allowNull: padrao === null,
        ...(padrao ? { defaultValue: padrao } : {})
      });
    }, Promise.resolve());
  },

  down: async (queryInterface, _Sequelize) => {
    const existeTabela = await queryInterface.sequelize
      .getQueryInterface()
      .showAllTables();
    const lista = (existeTabela as unknown as { tableName: string }[]).map(t =>
      typeof t === "string" ? t : t.tableName
    );

    if (!lista.includes("AiProviderSettings")) return;

    const colunas = await queryInterface.describeTable("AiProviderSettings");

    const novas = ["jevQuestions", "embeddingModel", "memoryCollection"];

    await novas
      .slice()
      .reverse()
      .reduce(async (anterior, nome) => {
        await anterior;
        if (colunas[nome]) {
          await queryInterface.removeColumn("AiProviderSettings", nome);
        }
      }, Promise.resolve());
  }
};
