/**
 * Criação da tabela AiProviderSettings (uma linha por empresa)
 * e inclusão da coluna replyEngine na tabela Prompts (override por prompt).
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const existeTabela = await queryInterface.sequelize
      .getQueryInterface()
      .showAllTables();
    const lista = (existeTabela as unknown as { tableName: string }[]).map(t =>
      typeof t === "string" ? t : t.tableName
    );

    if (!lista.includes("AiProviderSettings")) {
      await queryInterface.createTable("AiProviderSettings", {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        companyId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        enabled: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        defaultReplyEngine: {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: "default"
        },
        routingEngine: {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: "disabled"
        },
        routingConfidenceThreshold: {
          type: Sequelize.FLOAT,
          allowNull: false,
          defaultValue: 0.7
        },
        fallbackOnLowConfidence: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true
        },
        requestTimeout: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 30000
        },
        memoryEnabled: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        maxHistoryMessages: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 10
        },
        ollamaUrl: Sequelize.STRING,
        ollamaModel: Sequelize.STRING,
        openaiUrl: Sequelize.STRING,
        openaiApiKey: Sequelize.TEXT,
        openaiModel: Sequelize.STRING,
        geminiUrl: Sequelize.STRING,
        geminiApiKey: Sequelize.TEXT,
        geminiModel: Sequelize.STRING,
        anthropicUrl: Sequelize.STRING,
        anthropicApiKey: Sequelize.TEXT,
        anthropicModel: Sequelize.STRING,
        jevUrl: Sequelize.STRING,
        jevApiKey: Sequelize.TEXT,
        jevModel: Sequelize.STRING,
        jevQuestions: Sequelize.TEXT,
        layaUrl: Sequelize.STRING,
        layaApiKey: Sequelize.TEXT,
        layaModel: Sequelize.STRING,
        ttsProvider: {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: "custom"
        },
        ttsUrl: Sequelize.STRING,
        ttsApiKey: Sequelize.TEXT,
        ttsModel: Sequelize.STRING,
        ttsVoice: {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: "pt-BR-FabioNeural"
        },
        ttsFormat: {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: "mp3"
        },
        ttsSpeed: {
          type: Sequelize.FLOAT,
          allowNull: false,
          defaultValue: 1
        },
        ttsRegion: Sequelize.STRING,
        ttsEndpoint: Sequelize.STRING,
        ttsDeployment: Sequelize.STRING,
        sttProvider: {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: "custom"
        },
        sttUrl: Sequelize.STRING,
        sttApiKey: Sequelize.TEXT,
        sttModel: Sequelize.STRING,
        qdrantEnabled: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        qdrantUrl: Sequelize.STRING,
        qdrantApiKey: Sequelize.TEXT,
        qdrantCollectionPrefix: Sequelize.STRING,
        embeddingModel: {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: "nomic-embed-text"
        },
        memoryCollection: {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: "memoria"
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      });

      await queryInterface.addIndex("AiProviderSettings", {
        name: "ai_provider_settings_company_unique",
        unique: true,
        fields: ["companyId"]
      });
    }

    // Garante colunas novas em tabelas criadas por versões anteriores.
    const colunasSettings = await queryInterface.describeTable(
      "AiProviderSettings"
    );
    const colunasNovas: Array<[string, string, string | null]> = [
      ["jevQuestions", "TEXT", null],
      ["embeddingModel", "STRING", "nomic-embed-text"],
      ["memoryCollection", "STRING", "memoria"]
    ];

    await colunasNovas.reduce(async (anterior, [coluna, tipo, padrao]) => {
      await anterior;
      if (!colunasSettings[coluna]) {
        await queryInterface.addColumn("AiProviderSettings", coluna, {
          type: Sequelize[tipo as "TEXT"],
          allowNull: padrao === null,
          ...(padrao ? { defaultValue: padrao } : {})
        });
      }
    }, Promise.resolve());

    const colunasPrompt = await queryInterface.describeTable("Prompts");
    if (!colunasPrompt.replyEngine) {
      await queryInterface.addColumn("Prompts", "replyEngine", {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: null
      });
    }
  },

  down: async (queryInterface, _Sequelize) => {
    const colunasPrompt = await queryInterface.describeTable("Prompts");
    if (colunasPrompt.replyEngine) {
      await queryInterface.removeColumn("Prompts", "replyEngine");
    }

    const existeTabela = await queryInterface.sequelize
      .getQueryInterface()
      .showAllTables();
    const lista = (existeTabela as unknown as { tableName: string }[]).map(t =>
      typeof t === "string" ? t : t.tableName
    );

    if (lista.includes("AiProviderSettings")) {
      await queryInterface.dropTable("AiProviderSettings");
    }
  }
};
