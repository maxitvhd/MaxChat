/**
 * @TercioSantos-0 |
 * model/KnowledgeBase |
 * @descrição: base de conhecimento da empresa. Uma base pode ser geral
 *             (queueId nulo) ou amarrada a uma fila/produto, e é isolada
 *             por companyId na busca e na indexação.
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
  HasMany,
  AllowNull,
  Default
} from "sequelize-typescript";
import Company from "./Company";
import Queue from "./Queue";
import KnowledgeDocument from "./KnowledgeDocument";

@Table({ tableName: "KnowledgeBases" })
class KnowledgeBase extends Model<KnowledgeBase> {
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

  @ForeignKey(() => Queue)
  @AllowNull(true)
  @Column
  queueId: number;

  @BelongsTo(() => Queue)
  queue: Queue;

  @HasMany(() => KnowledgeDocument)
  documents: KnowledgeDocument[];

  @AllowNull(false)
  @Column
  name: string;

  @AllowNull(false)
  @Column
  slug: string;

  @AllowNull(true)
  @Column
  description: string;

  @Default(true)
  @Column
  active: boolean;

  @Default(900)
  @Column
  chunkSize: number;

  @Default(150)
  @Column
  chunkOverlap: number;

  @Default(0.45)
  @Column
  minScore: number;

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

export default KnowledgeBase;
