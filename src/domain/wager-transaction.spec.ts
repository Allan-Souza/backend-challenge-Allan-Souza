import { describe, it, expect } from 'vitest';
import { 
  WagerTransaction, 
  WagerTransactionKind, 
  WagerTransactionStatus, 
  FailureCode,
  LedgerDirection,
} from './wager-transaction.js';
import { Money } from './money.js';

describe('WagerTransaction Aggregate', () => {
  const defaultProps = {
    id: 'TX-1',
    providerId: 'PROV-1',
    externalTransactionId: 'EXT-BET-1',
    idempotencyKey: 'PROV-1:EXT-BET-1',
    payloadHash: 'HASH-1',
    walletId: 'W-1',
    playerId: 'P-123',
    currency: 'BRL',
    roundId: 'R-1',
    gameId: 'G-1',
  };

  describe('creation', () => {
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
      expect(tx.processedAt).toBeUndefined();
    });

    it('should create a LOSS transaction', () => {
      const money = Money.from({ amount: '50.00', currency: 'BRL' });
      const tx = WagerTransaction.create({
        ...defaultProps,
        kind: WagerTransactionKind.Loss,
        money,
      });
      expect(tx.kind).toBe(WagerTransactionKind.Loss);
    });

    it('should create a WIN transaction with reference', () => {
      const money = Money.from({ amount: '100.00', currency: 'BRL' });
      const tx = WagerTransaction.create({
        ...defaultProps,
        externalTransactionId: 'EXT-WIN-1',
        idempotencyKey: 'PROV-1:EXT-WIN-1',
        kind: WagerTransactionKind.Win,
        money,
        referenceExternalTransactionId: 'EXT-BET-1',
      });
      expect(tx.kind).toBe(WagerTransactionKind.Win);
      expect(tx.referenceExternalTransactionId).toBe('EXT-BET-1');
    });

    it('should throw error when REFUND is missing referenceExternalTransactionId', () => {
      const money = Money.from({ amount: '50.00', currency: 'BRL' });
      expect(() => WagerTransaction.create({
        ...defaultProps,
        externalTransactionId: 'EXT-REF-1',
        idempotencyKey: 'PROV-1:EXT-REF-1',
        kind: WagerTransactionKind.Refund,
        money,
      })).toThrow('requires a referenceExternalTransactionId');
    });

    it('should throw error when ROLLBACK is missing referenceExternalTransactionId', () => {
      const money = Money.from({ amount: '50.00', currency: 'BRL' });
      expect(() => WagerTransaction.create({
        ...defaultProps,
        externalTransactionId: 'EXT-RB-1',
        idempotencyKey: 'PROV-1:EXT-RB-1',
        kind: WagerTransactionKind.Rollback,
        money,
      })).toThrow('requires a referenceExternalTransactionId');
    });
  });

  describe('state transitions', () => {
    it('should transition to PROCESSED successfully', () => {
      const money = Money.from({ amount: '50.00', currency: 'BRL' });
      const tx = WagerTransaction.create({
        ...defaultProps,
        kind: WagerTransactionKind.Bet,
        money,
      });

      tx.markProcessed('REF-TX', new Date());
      expect(tx.status).toBe(WagerTransactionStatus.Processed);
      expect(tx.processedAt).toBeInstanceOf(Date);
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

    it('should transition to FAILED with a code', () => {
      const money = Money.from({ amount: '50.00', currency: 'BRL' });
      const tx = WagerTransaction.create({
        ...defaultProps,
        kind: WagerTransactionKind.Bet,
        money,
      });

      tx.fail(FailureCode.UNEXPECTED_ERROR);
      expect(tx.status).toBe(WagerTransactionStatus.Failed);
      expect(tx.failureCode).toBe(FailureCode.UNEXPECTED_ERROR);
    });

    it('should transition to PENDING_REFERENCE successfully', () => {
      const money = Money.from({ amount: '50.00', currency: 'BRL' });
      const tx = WagerTransaction.create({
        ...defaultProps,
        externalTransactionId: 'EXT-WIN-1',
        idempotencyKey: 'PROV-1:EXT-WIN-1',
        kind: WagerTransactionKind.Win,
        money,
        referenceExternalTransactionId: 'EXT-BET-1',
      });

      tx.markPendingReference();
      expect(tx.status).toBe(WagerTransactionStatus.PendingReference);
    });
  });

  describe('terminal state enforcement', () => {
    it('should throw when marking as PROCESSED from REJECTED', () => {
      const money = Money.from({ amount: '50.00', currency: 'BRL' });
      const tx = WagerTransaction.create({
        ...defaultProps,
        kind: WagerTransactionKind.Bet,
        money,
      });

      tx.reject(FailureCode.INSUFFICIENT_FUNDS);
      expect(() => tx.markProcessed('REF-TX', new Date())).toThrow('Cannot transition');
    });

    it('should throw when marking as PROCESSED from FAILED', () => {
      const money = Money.from({ amount: '50.00', currency: 'BRL' });
      const tx = WagerTransaction.create({
        ...defaultProps,
        kind: WagerTransactionKind.Bet,
        money,
      });

      tx.fail(FailureCode.UNEXPECTED_ERROR);
      expect(() => tx.markProcessed('REF-TX', new Date())).toThrow('Cannot transition');
    });

    it('should throw when rejecting from PROCESSED', () => {
      const money = Money.from({ amount: '50.00', currency: 'BRL' });
      const tx = WagerTransaction.create({
        ...defaultProps,
        kind: WagerTransactionKind.Bet,
        money,
      });

      tx.markProcessed(undefined, new Date());
      expect(() => tx.reject(FailureCode.INSUFFICIENT_FUNDS)).toThrow('Cannot transition');
    });

    it('should throw when failing from PROCESSED', () => {
      const money = Money.from({ amount: '50.00', currency: 'BRL' });
      const tx = WagerTransaction.create({
        ...defaultProps,
        kind: WagerTransactionKind.Bet,
        money,
      });

      tx.markProcessed(undefined, new Date());
      expect(() => tx.fail(FailureCode.UNEXPECTED_ERROR)).toThrow('Cannot transition');
    });
  });

  describe('domain queries', () => {
    it('should identify terminal states', () => {
      const money = Money.from({ amount: '50.00', currency: 'BRL' });
      
      const txProcessed = WagerTransaction.create({ ...defaultProps, kind: WagerTransactionKind.Bet, money });
      txProcessed.markProcessed(undefined, new Date());
      expect(txProcessed.isTerminal()).toBe(true);
      
      const txRejected = WagerTransaction.create({ ...defaultProps, id: 'TX-2', idempotencyKey: 'PROV-1:TX-2', externalTransactionId: 'TX-2', kind: WagerTransactionKind.Bet, money });
      txRejected.reject(FailureCode.INSUFFICIENT_FUNDS);
      expect(txRejected.isTerminal()).toBe(true);
      
      const txPending = WagerTransaction.create({ ...defaultProps, id: 'TX-3', idempotencyKey: 'PROV-1:TX-3', externalTransactionId: 'TX-3', kind: WagerTransactionKind.Bet, money });
      expect(txPending.isTerminal()).toBe(false);
    });

    it('should report that LOSS does not affect balance', () => {
      const money = Money.from({ amount: '50.00', currency: 'BRL' });
      const tx = WagerTransaction.create({
        ...defaultProps,
        kind: WagerTransactionKind.Loss,
        money,
      });
      expect(tx.affectsBalance()).toBe(false);
    });

    it('should report that BET affects balance', () => {
      const money = Money.from({ amount: '50.00', currency: 'BRL' });
      const tx = WagerTransaction.create({
        ...defaultProps,
        kind: WagerTransactionKind.Bet,
        money,
      });
      expect(tx.affectsBalance()).toBe(true);
    });

    it('should report that REFUND and ROLLBACK require reference', () => {
      const money = Money.from({ amount: '50.00', currency: 'BRL' });
      const betTx = WagerTransaction.create({ ...defaultProps, kind: WagerTransactionKind.Bet, money });
      expect(betTx.requiresReference()).toBe(false);

      const refundTx = WagerTransaction.create({ 
        ...defaultProps, id: 'TX-R', idempotencyKey: 'PROV-1:TX-R', externalTransactionId: 'TX-R',
        kind: WagerTransactionKind.Refund, money, referenceExternalTransactionId: 'EXT-BET-1' 
      });
      expect(refundTx.requiresReference()).toBe(true);
    });

    it('should match payload hash correctly', () => {
      const money = Money.from({ amount: '50.00', currency: 'BRL' });
      const tx = WagerTransaction.create({ ...defaultProps, kind: WagerTransactionKind.Bet, money });
      expect(tx.matchesPayload('HASH-1')).toBe(true);
      expect(tx.matchesPayload('HASH-DIFFERENT')).toBe(false);
    });

    it('should return correct ledger direction for BET (DEBIT)', () => {
      const money = Money.from({ amount: '50.00', currency: 'BRL' });
      const tx = WagerTransaction.create({ ...defaultProps, kind: WagerTransactionKind.Bet, money });
      expect(tx.ledgerDirectionFor()).toBe(LedgerDirection.Debit);
    });

    it('should return correct ledger direction for WIN (CREDIT)', () => {
      const money = Money.from({ amount: '50.00', currency: 'BRL' });
      const tx = WagerTransaction.create({
        ...defaultProps, id: 'TX-W', idempotencyKey: 'PROV-1:TX-W', externalTransactionId: 'TX-W',
        kind: WagerTransactionKind.Win, money, referenceExternalTransactionId: 'EXT-BET-1',
      });
      expect(tx.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
    });
  });

  describe('idempotency key and payload hash', () => {
    it('should store idempotency key and payload hash', () => {
      const money = Money.from({ amount: '50.00', currency: 'BRL' });
      const tx = WagerTransaction.create({
        ...defaultProps,
        idempotencyKey: 'PROV-1:EXT-BET-1',
        payloadHash: 'abc123hash',
        kind: WagerTransactionKind.Bet,
        money,
      });
      expect(tx.idempotencyKey).toBe('PROV-1:EXT-BET-1');
      expect(tx.payloadHash).toBe('abc123hash');
    });

    it('should detect payload hash mismatch (idempotency collision)', () => {
      const money = Money.from({ amount: '50.00', currency: 'BRL' });
      const tx = WagerTransaction.create({
        ...defaultProps,
        payloadHash: 'original-hash',
        kind: WagerTransactionKind.Bet,
        money,
      });
      // Same idempotency key but different payload = collision
      expect(tx.matchesPayload('original-hash')).toBe(true);
      expect(tx.matchesPayload('different-hash')).toBe(false);
    });
  });
});
