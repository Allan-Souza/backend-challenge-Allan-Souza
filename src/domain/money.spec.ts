import { describe, it, expect } from 'vitest';
import { Money } from './money.js';

describe('Money Value Object', () => {
  describe('creation and parsing', () => {
    it('should create money successfully from valid props', () => {
      const m = Money.from({ amount: '150.25', currency: 'BRL' });
      expect(m.toJSON()).toEqual({ amount: '150.25', currency: 'BRL' });
    });

    it('should correctly format strings with multiple decimals to max 2 decimal places', () => {
      expect(() => Money.from({ amount: '150.255', currency: 'BRL' }))
        .toThrow('Amount cannot have more than 2 decimal places');
    });

    it('should throw if amount is not a valid number', () => {
      expect(() => Money.from({ amount: 'invalid', currency: 'BRL' })).toThrow();
    });

    it('should throw if currency is empty', () => {
      expect(() => Money.from({ amount: '100', currency: '' })).toThrow('Currency cannot be empty');
    });

    it('should reject NaN', () => {
      expect(() => Money.from({ amount: 'NaN', currency: 'BRL' })).toThrow();
    });

    it('should reject Infinity', () => {
      expect(() => Money.from({ amount: 'Infinity', currency: 'BRL' })).toThrow();
    });

    it('should reject empty string', () => {
      expect(() => Money.from({ amount: '', currency: 'BRL' })).toThrow('Amount cannot be empty');
    });

    it('should reject scientific notation', () => {
      expect(() => Money.from({ amount: '1e5', currency: 'BRL' })).toThrow();
    });

    it('should normalize currency to uppercase', () => {
      const m = Money.from({ amount: '100.00', currency: 'brl' });
      expect(m.currency).toBe('BRL');
    });
  });

  describe('math operations', () => {
    it('should add two amounts correctly', () => {
      const a = Money.from({ amount: '0.10', currency: 'BRL' });
      const b = Money.from({ amount: '0.20', currency: 'BRL' });
      const result = a.add(b);
      expect(result.toJSON().amount).toBe('0.30');
    });

    it('should subtract two amounts correctly', () => {
      const a = Money.from({ amount: '100.50', currency: 'BRL' });
      const b = Money.from({ amount: '40.20', currency: 'BRL' });
      const result = a.subtract(b);
      expect(result.toJSON().amount).toBe('60.30');
    });

    it('should correctly determine negative amounts', () => {
      const a = Money.from({ amount: '100', currency: 'BRL' });
      const b = Money.from({ amount: '150', currency: 'BRL' });
      const result = a.subtract(b);
      expect(result.isNegative()).toBe(true);
      expect(result.toJSON().amount).toBe('-50.00');
    });

    it('should negate an amount', () => {
      const m = Money.from({ amount: '50.00', currency: 'BRL' });
      expect(m.negate().toJSON().amount).toBe('-50.00');
      expect(m.negate().negate().toJSON().amount).toBe('50.00');
    });

    it('should throw when adding different currencies', () => {
      const a = Money.from({ amount: '10', currency: 'BRL' });
      const b = Money.from({ amount: '10', currency: 'USD' });
      expect(() => a.add(b)).toThrow('Currency mismatch');
    });

    it('should throw when subtracting different currencies', () => {
      const a = Money.from({ amount: '10', currency: 'BRL' });
      const b = Money.from({ amount: '10', currency: 'USD' });
      expect(() => a.subtract(b)).toThrow('Currency mismatch');
    });

    it('should throw when comparing different currencies', () => {
      const a = Money.from({ amount: '10', currency: 'BRL' });
      const b = Money.from({ amount: '10', currency: 'USD' });
      expect(() => a.isLessThan(b)).toThrow('Currency mismatch');
    });

    it('should return false for equals with different currencies', () => {
      const a = Money.from({ amount: '10', currency: 'BRL' });
      const b = Money.from({ amount: '10', currency: 'USD' });
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('comparisons', () => {
    it('should correctly compare equal amounts', () => {
      const a = Money.from({ amount: '100.00', currency: 'BRL' });
      const b = Money.from({ amount: '100', currency: 'BRL' });
      expect(a.equals(b)).toBe(true);
    });

    it('should correctly identify less than', () => {
      const a = Money.from({ amount: '50', currency: 'BRL' });
      const b = Money.from({ amount: '100', currency: 'BRL' });
      expect(a.isLessThan(b)).toBe(true);
      expect(b.isLessThan(a)).toBe(false);
    });

    it('should correctly identify zero', () => {
      const m = Money.zero('BRL');
      expect(m.isZero()).toBe(true);
      expect(m.isPositive()).toBe(false);
      expect(m.isNegative()).toBe(false);
      
      const m2 = Money.from({ amount: '0.00', currency: 'USD' });
      expect(m2.isZero()).toBe(true);
    });
  });

  describe('immutability', () => {
    it('should not modify original instance on add', () => {
      const a = Money.from({ amount: '100.00', currency: 'BRL' });
      const b = Money.from({ amount: '50.00', currency: 'BRL' });
      const result = a.add(b);
      expect(a.toJSON().amount).toBe('100.00');
      expect(result.toJSON().amount).toBe('150.00');
    });

    it('should not modify original instance on subtract', () => {
      const a = Money.from({ amount: '100.00', currency: 'BRL' });
      const b = Money.from({ amount: '30.00', currency: 'BRL' });
      const result = a.subtract(b);
      expect(a.toJSON().amount).toBe('100.00');
      expect(result.toJSON().amount).toBe('70.00');
    });

    it('should not modify original instance on negate', () => {
      const a = Money.from({ amount: '100.00', currency: 'BRL' });
      const negated = a.negate();
      expect(a.toJSON().amount).toBe('100.00');
      expect(negated.toJSON().amount).toBe('-100.00');
    });
  });

  describe('toString', () => {
    it('should format as "amount currency"', () => {
      const m = Money.from({ amount: '123.45', currency: 'BRL' });
      expect(m.toString()).toBe('123.45 BRL');
    });
  });
});
