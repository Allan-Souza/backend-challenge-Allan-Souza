import { IntegrationEvent, IntegrationEventProps } from './messaging.js';
import { LedgerDirection } from './wager-transaction.js';

// ────────────────────────────────────────────────
// Event Data Interfaces
// ────────────────────────────────────────────────

export interface MoneyProps {
  amount: string;
  currency: string;
}

export interface WagerTransactionProcessedData {
  transactionId: string;
  walletId: string;
  playerId: string;
  providerId: string;
  kind: string;
  money: MoneyProps;
  roundId: string;
  gameId: string;
}

export interface WagerTransactionRejectedData {
  transactionId: string;
  walletId: string;
  playerId: string;
  providerId: string;
  kind: string;
  money: MoneyProps;
  failureCode: string;
}

export interface WalletBalanceChangedData {
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: MoneyProps;
  balanceBefore: MoneyProps;
  balanceAfter: MoneyProps;
  walletVersion: number;
}

export interface WagerTransactionPendingReferenceData {
  transactionId: string;
  walletId: string;
  playerId: string;
  providerId: string;
  kind: string;
  referenceExternalTransactionId: string;
}

// ────────────────────────────────────────────────
// Typed Event Classes
// ────────────────────────────────────────────────

export class WagerTransactionProcessed extends IntegrationEvent<WagerTransactionProcessedData> {
  readonly eventType = 'WagerTransactionProcessed' as const;
  readonly version = 1;

  static from(props: IntegrationEventProps<WagerTransactionProcessedData>): WagerTransactionProcessed {
    return new WagerTransactionProcessed(props);
  }
}

export class WagerTransactionRejected extends IntegrationEvent<WagerTransactionRejectedData> {
  readonly eventType = 'WagerTransactionRejected' as const;
  readonly version = 1;

  static from(props: IntegrationEventProps<WagerTransactionRejectedData>): WagerTransactionRejected {
    return new WagerTransactionRejected(props);
  }
}

export class WalletBalanceChanged extends IntegrationEvent<WalletBalanceChangedData> {
  readonly eventType = 'WalletBalanceChanged' as const;
  readonly version = 1;

  static from(props: IntegrationEventProps<WalletBalanceChangedData>): WalletBalanceChanged {
    return new WalletBalanceChanged(props);
  }
}

export class WagerTransactionPendingReference extends IntegrationEvent<WagerTransactionPendingReferenceData> {
  readonly eventType = 'WagerTransactionPendingReference' as const;
  readonly version = 1;

  static from(props: IntegrationEventProps<WagerTransactionPendingReferenceData>): WagerTransactionPendingReference {
    return new WagerTransactionPendingReference(props);
  }
}
