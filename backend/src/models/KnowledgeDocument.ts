/**
 * @TercioSantos-0 |
 * model/KnowledgeDocument |
 * @descrição: documento ingerido dentro de uma base de conhecimento.
 *             Guarda o texto extraído para permitir reindexação e auditoria,
 *             e o status do processamento (pdf/url passam por extração).
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
import KnowledgeBase from "./KnowledgeBase";

@Table({ tableName: "KnowledgeDocuments" })
class KnowledgeDocument extends Model<KnowledgeDocument> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => KnowledgeBase)
  @AllowNull(false)
  @Column
  baseId: number;

  @BelongsTo(() => KnowledgeBase)
  base: KnowledgeBase;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @AllowNull(false)
  @Column
  title: string;

  @AllowNull(false)
  @Column
  kind: string;

  @AllowNull(true)
  @Column
  fileName: string;

  @AllowNull(true)
  @Column
  sourceUrl: string;

  @Default(0)
  @Column
  sizeBytes: number;

  @AllowNull(true)
  @Column
  rawText: string;

  @Default("pendente")
  @Column
  status: string;

  @Default(0)
  @Column
  chunkCount: number;

  @AllowNull(true)
  @Column
  errorMessage: string;

  @AllowNull(true)
  @Column
  createdByUserId: number;

  @CreatedAt
  @Column
  createdAt: Date;

  @UpdatedAt
  @Column
  updatedAt: Date;
}

export default KnowledgeDocument;
