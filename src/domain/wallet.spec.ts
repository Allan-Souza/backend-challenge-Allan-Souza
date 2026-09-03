import { describe, it, expect } from 'vitest';
import { Wallet } from './wallet.js';
import { Money } from './money.js';

describe('Wallet Aggregate', () => {
  it('should create a new wallet with initial balance', () => {
    const initialBalance = Money.from({ amount: '100.00', currency: 'BRL' });
    const wallet = Wallet.open({ id: 'W-1', playerId: 'P-123', initialBalance });
    
    expect(wallet.id).toBeDefined();
    expect(wallet.playerId).toBe('P-123');
    expect(wallet.currency).toBe('BRL');
    expect(wallet.balance.equals(initialBalance)).toBe(true);
    expect(wallet.version).toBe(1); // Usually starts at 1
  });

  it('should debit funds correctly', () => {
    const wallet = Wallet.open({ id: 'W-1', playerId: 'P-123', initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }) });
    
    const debitAmount = Money.from({ amount: '30.00', currency: 'BRL' });
    wallet.debit(debitAmount);
    
    expect(wallet.balance.toJSON().amount).toBe('70.00');
  });

  it('should throw error when debiting more than balance', () => {
    const wallet = Wallet.open({ id: 'W-1', playerId: 'P-123', initialBalance: Money.from({ amount: '50.00', currency: 'BRL' }) });
    
    const debitAmount = Money.from({ amount: '60.00', currency: 'BRL' });
    expect(() => wallet.debit(debitAmount)).toThrow('Insufficient funds');
  });

  it('should throw error when debiting negative amount', () => {
    const wallet = Wallet.open({ id: 'W-1', playerId: 'P-123', initialBalance: Money.from({ amount: '50.00', currency: 'BRL' }) });
    
    const negativeAmount = Money.from({ amount: '-10.00', currency: 'BRL' });
    expect(() => wallet.debit(negativeAmount)).toThrow('Cannot debit a negative amount');
  });

  it('should credit funds correctly', () => {
    const wallet = Wallet.open({ id: 'W-1', playerId: 'P-123', initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }) });
    
    const creditAmount = Money.from({ amount: '30.00', currency: 'BRL' });
    wallet.credit(creditAmount);
    
    expect(wallet.balance.toJSON().amount).toBe('130.00');
  });

  it('should throw error when crediting negative amount', () => {
    const wallet = Wallet.open({ id: 'W-1', playerId: 'P-123', initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }) });
    
    const negativeAmount = Money.from({ amount: '-10.00', currency: 'BRL' });
    expect(() => wallet.credit(negativeAmount)).toThrow('Cannot credit a negative amount');
  });

  it('should throw error when operating with mismatched currencies', () => {
    const wallet = Wallet.open({ id: 'W-1', playerId: 'P-123', initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }) });
    
    const wrongCurrency = Money.from({ amount: '10.00', currency: 'USD' });
    expect(() => wallet.debit(wrongCurrency)).toThrow('Currency mismatch');
    expect(() => wallet.credit(wrongCurrency)).toThrow('Currency mismatch');
  });
});
