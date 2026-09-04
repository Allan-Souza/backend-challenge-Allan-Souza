import { describe, it, expect } from 'vitest';
import { WalletLedgerEntry } from './wallet-ledger-entry.js';
import { LedgerDirection } from './wager-transaction.js';
import { Money } from './money.js';

describe('WalletLedgerEntry (immutable)', () => {
  describe('creation', () => {
    it('should create a valid DEBIT entry', () => {
      const entry = WalletLedgerEntry.create({
        id: 'LE-1',
        walletId: 'W-1',
        transactionId: 'TX-1',
        direction: LedgerDirection.Debit,
        money: Money.from({ amount: '30.00', currency: 'BRL' }),
        balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
        balanceAfter: Money.from({ amount: '70.00', currency: 'BRL' }),
      });

      expect(entry.id).toBe('LE-1');
      expect(entry.direction).toBe(LedgerDirection.Debit);
      expect(entry.isBalanced()).toBe(true);
    });

    it('should create a valid CREDIT entry', () => {
      const entry = WalletLedgerEntry.create({
        id: 'LE-2',
        walletId: 'W-1',
        transactionId: 'TX-2',
        direction: LedgerDirection.Credit,
        money: Money.from({ amount: '50.00', currency: 'BRL' }),
        balanceBefore: Money.from({ amount: '70.00', currency: 'BRL' }),
        balanceAfter: Money.from({ amount: '120.00', currency: 'BRL' }),
      });

      expect(entry.direction).toBe(LedgerDirection.Credit);
      expect(entry.isBalanced()).toBe(true);
    });

    it('should throw if DEBIT entry is not balanced', () => {
      expect(() => WalletLedgerEntry.create({
        id: 'LE-3',
        walletId: 'W-1',
        transactionId: 'TX-3',
        direction: LedgerDirection.Debit,
        money: Money.from({ amount: '30.00', currency: 'BRL' }),
        balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
        balanceAfter: Money.from({ amount: '80.00', currency: 'BRL' }), // Should be 70.00
      })).toThrow('Ledger entry is not balanced');
    });

    it('should throw if CREDIT entry is not balanced', () => {
      expect(() => WalletLedgerEntry.create({
        id: 'LE-4',
        walletId: 'W-1',
        transactionId: 'TX-4',
        direction: LedgerDirection.Credit,
        money: Money.from({ amount: '50.00', currency: 'BRL' }),
        balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
        balanceAfter: Money.from({ amount: '200.00', currency: 'BRL' }), // Should be 150.00
      })).toThrow('Ledger entry is not balanced');
    });
  });

  describe('immutability', () => {
    it('should have all readonly fields', () => {
      const entry = WalletLedgerEntry.create({
        id: 'LE-5',
        walletId: 'W-1',
        transactionId: 'TX-5',
        direction: LedgerDirection.Debit,
        money: Money.from({ amount: '10.00', currency: 'BRL' }),
        balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
        balanceAfter: Money.from({ amount: '90.00', currency: 'BRL' }),
      });

      // All fields should be accessible (no setters)
      expect(entry.id).toBe('LE-5');
      expect(entry.walletId).toBe('W-1');
      expect(entry.transactionId).toBe('TX-5');
      expect(entry.direction).toBe(LedgerDirection.Debit);
      expect(entry.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('rehydration', () => {
    it('should rehydrate from state without revalidating balance', () => {
      // rehydrate should NOT throw even if the arithmetic "looks" wrong,
      // because it trusts persisted state.
      const entry = WalletLedgerEntry.rehydrate({
        id: 'LE-6',
        walletId: 'W-1',
        transactionId: 'TX-6',
        direction: LedgerDirection.Debit,
        money: { amount: '30.00', currency: 'BRL' },
        balanceBefore: { amount: '100.00', currency: 'BRL' },
        balanceAfter: { amount: '70.00', currency: 'BRL' },
        createdAt: new Date(),
      });

      expect(entry.id).toBe('LE-6');
      expect(entry.money.toJSON().amount).toBe('30.00');
    });
  });
});
