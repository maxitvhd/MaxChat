/**
 * Criação da base de conhecimento multiempresa/produto.
 *
 * Duas tabelas:
 *  - KnowledgeBases: uma base por empresa, opcionalmente amarrada a uma fila (produto).
 *  - KnowledgeDocuments: os documentos ingeridos dentro de uma base.
 *
 * Também adiciona as colunas do agente de voz em AiProviderSettings, para que
 * qualquer empresa possa ligar o agente sem mexer em nada global.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const existeTabela = await queryInterface.sequelize
      .getQueryInterface()
      .showAllTables();
    const lista = (existeTabela as unknown as { tableName: string }[]).map(t =>
      typeof t === "string" ? t : t.tableName
    );

    if (!lista.includes("KnowledgeBases")) {
      await queryInterface.createTable("KnowledgeBases", {
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
        queueId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "Queues", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        name: {
          type: Sequelize.STRING,
          allowNull: false
        },
        slug: {
          type: Sequelize.STRING,
          allowNull: false
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true
        },
        chunkSize: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 900
        },
        chunkOverlap: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 150
        },
        minScore: {
          type: Sequelize.FLOAT,
          allowNull: false,
          defaultValue: 0.45
        },
        createdByUserId: {
          type: Sequelize.INTEGER,
          allowNull: true
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

      await queryInterface.addIndex("KnowledgeBases", {
        name: "knowledge_bases_company_slug_unique",
        unique: true,
        fields: ["companyId", "slug"]
      });
      await queryInterface.addIndex("KnowledgeBases", {
        name: "knowledge_bases_company_queue",
        fields: ["companyId", "queueId"]
      });
    }

    if (!lista.includes("KnowledgeDocuments")) {
      await queryInterface.createTable("KnowledgeDocuments", {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        baseId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "KnowledgeBases", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        companyId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        title: {
          type: Sequelize.STRING,
          allowNull: false
        },
        kind: {
          type: Sequelize.STRING,
          allowNull: false
        },
        fileName: {
          type: Sequelize.STRING,
          allowNull: true
        },
        sourceUrl: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        sizeBytes: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        rawText: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        status: {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: "pendente"
        },
        chunkCount: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        errorMessage: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        createdByUserId: {
          type: Sequelize.INTEGER,
          allowNull: true
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

      await queryInterface.addIndex("KnowledgeDocuments", {
        name: "knowledge_documents_base",
        fields: ["baseId"]
      });
      await queryInterface.addIndex("KnowledgeDocuments", {
        name: "knowledge_documents_company_status",
        fields: ["companyId", "status"]
      });
    }

    // Colunas do agente de voz em AiProviderSettings (idempotente).
    // Defaults iguais aos do model: enabled desligado, confiança 0.6 e
    // escrita restrita a admin. Empresa nova entra com o agente pronto
    // para ser ligado, sem ação manual.
    const colunasSettings = await queryInterface.describeTable(
      "AiProviderSettings"
    );
    const colunasVoz: Array<{
      nome: string;
      tipo: "BOOLEAN" | "STRING" | "FLOAT";
      padrao: boolean | string | number;
    }> = [
      { nome: "voiceAgentEnabled", tipo: "BOOLEAN", padrao: false },
      { nome: "voiceAgentModel", tipo: "STRING", padrao: "qwen3.5:4b" },
      { nome: "voiceAgentPermission", tipo: "STRING", padrao: "admin" },
      { nome: "voiceAgentConfidence", tipo: "FLOAT", padrao: 0.6 }
    ];

    for (const { nome, tipo, padrao } of colunasVoz) {
      if (colunasSettings[nome]) continue;
      await queryInterface.addColumn("AiProviderSettings", nome, {
        type: Sequelize[tipo],
        allowNull: false,
        defaultValue: padrao
      });
    }

    // Empresas criadas antes desta migration podem ter ficado com NULL
    // nesses campos; o agente trata NULL como "não pode confiar", então
    // normalizamos para os mesmos defaults.
    await queryInterface.sequelize.query(
      'UPDATE "AiProviderSettings" SET "voiceAgentEnabled" = false WHERE "voiceAgentEnabled" IS NULL'
    );
    await queryInterface.sequelize.query(
      'UPDATE "AiProviderSettings" SET "voiceAgentModel" = \'qwen3.5:4b\' WHERE "voiceAgentModel" IS NULL OR "voiceAgentModel" = \'\''
    );
    await queryInterface.sequelize.query(
      'UPDATE "AiProviderSettings" SET "voiceAgentPermission" = \'admin\' WHERE "voiceAgentPermission" IS NULL OR "voiceAgentPermission" = \'\''
    );
    await queryInterface.sequelize.query(
      'UPDATE "AiProviderSettings" SET "voiceAgentConfidence" = 0.6 WHERE "voiceAgentConfidence" IS NULL'
    );

    // Se a coluna já existia (migration aplicada antes deste ajuste), ela
    // pode ter ficado sem default ou aceitando NULL. Alinhar com o model.
    for (const { nome, tipo, padrao } of colunasVoz) {
      const atual = await queryInterface.describeTable("AiProviderSettings");
      if (!atual[nome]) continue;
      if (atual[nome].allowNull === true) {
        await queryInterface.changeColumn("AiProviderSettings", nome, {
          type: Sequelize[tipo],
          allowNull: false,
          defaultValue: padrao
        });
      }
    }
  },

  down: async (queryInterface, _Sequelize) => {
    const existeTabela = await queryInterface.sequelize
      .getQueryInterface()
      .showAllTables();
    const lista = (existeTabela as unknown as { tableName: string }[]).map(t =>
      typeof t === "string" ? t : t.tableName
    );

    if (lista.includes("KnowledgeDocuments")) {
      await queryInterface.dropTable("KnowledgeDocuments");
    }
    if (lista.includes("KnowledgeBases")) {
      await queryInterface.dropTable("KnowledgeBases");
    }

    const colunasSettings = await queryInterface.describeTable(
      "AiProviderSettings"
    );
    for (const coluna of [
      "voiceAgentEnabled",
      "voiceAgentModel",
      "voiceAgentPermission",
      "voiceAgentConfidence"
    ]) {
      if (colunasSettings[coluna]) {
        await queryInterface.removeColumn("AiProviderSettings", coluna);
      }
    }
  }
};
