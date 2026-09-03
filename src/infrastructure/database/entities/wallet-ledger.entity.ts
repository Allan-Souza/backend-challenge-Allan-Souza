import { EntitySchema } from '@mikro-orm/core';
import { WalletLedgerEntry } from '../../../domain/wallet-ledger-entry.js';
import { LedgerDirection } from '../../../domain/wager-transaction.js';

export class WalletLedgerEntity {
  id!: string;
  walletId!: string;
  transactionId!: string;
  direction!: LedgerDirection;
  moneyAmount!: string;
  moneyCurrency!: string;
  balanceBeforeAmount!: string;
  balanceBeforeCurrency!: string;
  balanceAfterAmount!: string;
  balanceAfterCurrency!: string;
  createdAt!: Date;

  toDomain(): WalletLedgerEntry {
    return WalletLedgerEntry.rehydrate({
      id: this.id,
      walletId: this.walletId,
      transactionId: this.transactionId,
      direction: this.direction,
      money: { amount: this.moneyAmount, currency: this.moneyCurrency },
      balanceBefore: { amount: this.balanceBeforeAmount, currency: this.balanceBeforeCurrency },
      balanceAfter: { amount: this.balanceAfterAmount, currency: this.balanceAfterCurrency },
      createdAt: this.createdAt,
    });
  }

  static fromDomain(entry: WalletLedgerEntry): WalletLedgerEntity {
    const entity = new WalletLedgerEntity();
    entity.id = entry.id;
    entity.walletId = entry.walletId;
    entity.transactionId = entry.transactionId;
    entity.direction = entry.direction;
    entity.moneyAmount = entry.money.toJSON().amount;
    entity.moneyCurrency = entry.money.currency;
    entity.balanceBeforeAmount = entry.balanceBefore.toJSON().amount;
    entity.balanceBeforeCurrency = entry.balanceBefore.currency;
    entity.balanceAfterAmount = entry.balanceAfter.toJSON().amount;
    entity.balanceAfterCurrency = entry.balanceAfter.currency;
    entity.createdAt = entry.createdAt;
    return entity;
  }
}

export const WalletLedgerSchema = new EntitySchema<WalletLedgerEntity>({
  class: WalletLedgerEntity,
  tableName: 'wallet_ledger',
  indexes: [{ properties: ['walletId', 'createdAt'] }],
  properties: {
    id: { type: 'string', primary: true },
    walletId: { type: 'string' },
    transactionId: { type: 'string', unique: true },
    direction: { enum: true, items: () => LedgerDirection },
    moneyAmount: { type: 'string', columnType: 'numeric(18,2)' },
    moneyCurrency: { type: 'string' },
    balanceBeforeAmount: { type: 'string', columnType: 'numeric(18,2)' },
    balanceBeforeCurrency: { type: 'string' },
    balanceAfterAmount: { type: 'string', columnType: 'numeric(18,2)' },
    balanceAfterCurrency: { type: 'string' },
    createdAt: { type: 'Date' },
  },
});

