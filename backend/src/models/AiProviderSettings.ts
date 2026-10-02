/**
 * @TercioSantos-0 |
 * model/AiProviderSettings |
 * @descrição: configurações de IA da empresa (LLM, roteamento JEV/Laya,
 *             voz TTS/STT e memória no Qdrant). Uma linha por empresa.
 */
import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  AllowNull,
  Default
} from "sequelize-typescript";
import Company from "./Company";

@Table({ tableName: "AiProviderSettings" })
class AiProviderSettings extends Model<AiProviderSettings> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Default(false)
  @Column
  enabled: boolean;

  // ------------------------------------------------ Motor de resposta padrão
  @Default("default")
  @Column
  defaultReplyEngine: string;

  // ------------------------------------------------ Roteamento JEV/Laya
  @Default("disabled")
  @Column
  routingEngine: string;

  @Default(0.7)
  @Column
  routingConfidenceThreshold: number;

  @Default(true)
  @Column
  fallbackOnLowConfidence: boolean;

  @Default(30000)
  @Column
  requestTimeout: number;

  // ------------------------------------------------ Memória (Qdrant)
  @Default(false)
  @Column
  memoryEnabled: boolean;

  @Default(10)
  @Column
  maxHistoryMessages: number;

  // ------------------------------------------------ Providers de LLM
  @Column
  ollamaUrl: string;

  @Column
  ollamaModel: string;

  @Column
  openaiUrl: string;

  @Column
  openaiApiKey: string;

  @Column
  openaiModel: string;

  @Column
  geminiUrl: string;

  @Column
  geminiApiKey: string;

  @Column
  geminiModel: string;

  @Column
  anthropicUrl: string;

  @Column
  anthropicApiKey: string;

  @Column
  anthropicModel: string;

  // ------------------------------------------------ TypeSafe (JEV)
  @Column
  jevUrl: string;

  @Column
  jevApiKey: string;

  @Column
  jevModel: string;

  // Spec de perguntas do JEV em JSON. Cada chave vira uma question {type, criteria}.
  @Column
  jevQuestions: string;

  // ------------------------------------------------ Laya
  @Column
  layaUrl: string;

  @Column
  layaApiKey: string;

  @Column
  layaModel: string;

  // ------------------------------------------------ Voz TTS
  @Default("custom")
  @Column
  ttsProvider: string;

  @Column
  ttsUrl: string;

  @Column
  ttsApiKey: string;

  @Column
  ttsModel: string;

  @Default("pt-BR-FabioNeural")
  @Column
  ttsVoice: string;

  @Default("mp3")
  @Column
  ttsFormat: string;

  @Default(1)
  @Column
  ttsSpeed: number;

  @Column
  ttsRegion: string;

  @Column
  ttsEndpoint: string;

  @Column
  ttsDeployment: string;

  // ------------------------------------------------ STT
  @Default("custom")
  @Column
  sttProvider: string;

  @Column
  sttUrl: string;

  @Column
  sttApiKey: string;

  @Column
  sttModel: string;

  // ------------------------------------------------ Qdrant
  @Default(false)
  @Column
  qdrantEnabled: boolean;

  @Column
  qdrantUrl: string;

  @Column
  qdrantApiKey: string;

  @Column
  qdrantCollectionPrefix: string;

  // ------------------------------------------- Embeddings (memória)
  @Default("nomic-embed-text")
  @Column
  embeddingModel: string;

  @Default("memoria")
  @Column
  memoryCollection: string;

  @CreatedAt
  @Column
  createdAt: Date;

  @UpdatedAt
  @Column
  updatedAt: Date;
}

export default AiProviderSettings;
