import { describe, it, expect } from 'vitest';
import { 
  WagerTransaction, 
  WagerTransactionKind, 
  WagerTransactionStatus, 
  FailureCode 
} from './wager-transaction.js';
import { Money } from './money.js';

describe('WagerTransaction Aggregate', () => {
  const defaultProps = {
    id: 'TX-1',
    providerId: 'PROV-1',
    externalTransactionId: 'EXT-BET-1',
    idempotencyKey: 'IDEMP-1',
    payloadHash: 'HASH-1',
    walletId: 'W-1',
    playerId: 'P-123',
    currency: 'BRL',
    roundId: 'R-1',
    gameId: 'G-1',
  };

  it('should create a valid BET transaction in PENDING state', () => {
    const money = Money.from({ amount: '50.00', currency: 'BRL' });
    const tx = WagerTransaction.create({
      ...defaultProps,
      kind: WagerTransactionKind.Bet,
      money,
    });

    expect(tx.status).toBe(WagerTransactionStatus.Pending);
    expect(tx.kind).toBe(WagerTransactionKind.Bet);
    expect(tx.failureCode).toBeUndefined();
  });

  it('should transition to PROCESSED successfully', () => {
    const money = Money.from({ amount: '50.00', currency: 'BRL' });
    const tx = WagerTransaction.create({
      ...defaultProps,
      kind: WagerTransactionKind.Bet,
      money,
    });

    tx.markProcessed('REF-TX', new Date());
    expect(tx.status).toBe(WagerTransactionStatus.Processed);
  });

  it('should transition to REJECTED successfully with a code', () => {
    const money = Money.from({ amount: '50.00', currency: 'BRL' });
    const tx = WagerTransaction.create({
      ...defaultProps,
      kind: WagerTransactionKind.Bet,
      money,
    });

    tx.reject(FailureCode.INSUFFICIENT_FUNDS);
    expect(tx.status).toBe(WagerTransactionStatus.Rejected);
    expect(tx.failureCode).toBe(FailureCode.INSUFFICIENT_FUNDS);
  });

  it('should transition to PENDING_REFERENCE successfully', () => {
    const money = Money.from({ amount: '50.00', currency: 'BRL' });
    const tx = WagerTransaction.create({
      ...defaultProps,
      externalTransactionId: 'EXT-WIN-1',
      kind: WagerTransactionKind.Win,
      money,
    });

    tx.markPendingReference();
    expect(tx.status).toBe(WagerTransactionStatus.PendingReference);
  });

  it('should throw error when marking as PROCESSED from an invalid state', () => {
    const money = Money.from({ amount: '50.00', currency: 'BRL' });
    const tx = WagerTransaction.create({
      ...defaultProps,
      kind: WagerTransactionKind.Bet,
      money,
    });

    tx.reject(FailureCode.INSUFFICIENT_FUNDS);
    // Now it's REJECTED, cannot mark as PROCESSED
    expect(() => tx.markProcessed('REF-TX', new Date())).toThrow('Cannot transition');
  });

  it('should throw error when reference is missing for WIN/REFUND/ROLLBACK', () => {
    const money = Money.from({ amount: '50.00', currency: 'BRL' });
    
    expect(() => WagerTransaction.create({
      ...defaultProps,
      externalTransactionId: 'EXT-WIN-1',
      kind: WagerTransactionKind.Refund,
      money,
      // Missing referenceExternalTransactionId
    })).toThrow('requires a referenceExternalTransactionId');
  });
});
