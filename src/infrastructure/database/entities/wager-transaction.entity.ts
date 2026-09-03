import { EntitySchema } from '@mikro-orm/core';
import { 
  WagerTransaction, 
  WagerTransactionKind, 
  WagerTransactionStatus, 
  FailureCode 
} from '../../../domain/wager-transaction.js';

export class WagerTransactionEntity {
  id!: string;
  providerId!: string;
  externalTransactionId!: string;
  idempotencyKey!: string;
  payloadHash!: string;
  walletId!: string;
  playerId!: string;
  roundId!: string;
  gameId!: string;
  kind!: WagerTransactionKind;
  moneyAmount!: string;
  moneyCurrency!: string;
  referenceExternalTransactionId?: string;
  createdAt!: Date;
  status!: WagerTransactionStatus;
  referenceTransactionId?: string;
  failureCode?: FailureCode;
  processedAt?: Date;

  toDomain(): WagerTransaction {
    return WagerTransaction.rehydrate({
      id: this.id,
      providerId: this.providerId,
      externalTransactionId: this.externalTransactionId,
      idempotencyKey: this.idempotencyKey,
      payloadHash: this.payloadHash,
      walletId: this.walletId,
      playerId: this.playerId,
      roundId: this.roundId,
      gameId: this.gameId,
      kind: this.kind,
      money: { amount: this.moneyAmount, currency: this.moneyCurrency },
      referenceExternalTransactionId: this.referenceExternalTransactionId,
      createdAt: this.createdAt,
      status: this.status,
      referenceTransactionId: this.referenceTransactionId,
      failureCode: this.failureCode,
      processedAt: this.processedAt,
    });
  }

  static fromDomain(tx: WagerTransaction): WagerTransactionEntity {
    const entity = new WagerTransactionEntity();
    entity.id = tx.id;
    entity.providerId = tx.providerId;
    entity.externalTransactionId = tx.externalTransactionId;
    entity.idempotencyKey = tx.idempotencyKey;
    entity.payloadHash = tx.payloadHash;
    entity.walletId = tx.walletId;
    entity.playerId = tx.playerId;
    entity.roundId = tx.roundId;
    entity.gameId = tx.gameId;
    entity.kind = tx.kind;
    entity.moneyAmount = tx.money.toJSON().amount;
    entity.moneyCurrency = tx.money.currency;
    entity.referenceExternalTransactionId = tx.referenceExternalTransactionId;
    entity.createdAt = tx.createdAt;
    entity.status = tx.status;
    entity.referenceTransactionId = tx.referenceTransactionId;
    entity.failureCode = tx.failureCode;
    entity.processedAt = tx.processedAt;
    return entity;
  }
}

export const WagerTransactionSchema = new EntitySchema<WagerTransactionEntity>({
  class: WagerTransactionEntity,
  tableName: 'wager_transactions',
  uniques: [{ properties: ['idempotencyKey'] }],
  indexes: [{ properties: ['providerId', 'externalTransactionId'] }],
  properties: {
    id: { type: 'string', primary: true },
    providerId: { type: 'string' },
    externalTransactionId: { type: 'string' },
    idempotencyKey: { type: 'string' },
    payloadHash: { type: 'string' },
    walletId: { type: 'string' },
    playerId: { type: 'string' },
    roundId: { type: 'string' },
    gameId: { type: 'string' },
    kind: { enum: true, items: () => WagerTransactionKind },
    moneyAmount: { type: 'string', columnType: 'numeric(18,2)' },
    moneyCurrency: { type: 'string' },
    referenceExternalTransactionId: { type: 'string', nullable: true },
    createdAt: { type: 'Date' },
    status: { enum: true, items: () => WagerTransactionStatus },
    referenceTransactionId: { type: 'string', nullable: true },
    failureCode: { enum: true, items: () => FailureCode, nullable: true },
    processedAt: { type: 'Date', nullable: true },
  },
});

