import { Money, MoneyProps } from './money.js';
import { WagerTransaction, WagerTransactionKind, LedgerDirection } from './wager-transaction.js';

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: MoneyProps;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static open(props: {
    id: string;
    playerId: string;
    initialBalance: Money;
  }): Wallet {
    if (props.initialBalance.isNegative()) {
      throw new Error('Initial balance cannot be negative');
    }
    const now = new Date();
    return new Wallet(
      props.id,
      props.playerId,
      props.initialBalance.currency,
      props.initialBalance,
      1,
      now,
      now,
    );
  }

  static rehydrate(state: WalletState): Wallet {
    return new Wallet(
      state.id,
      state.playerId,
      state.currency,
      Money.from(state.balance),
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(amount: Money): void {
    this.assertSameCurrency(amount);
    
    if (amount.isNegative()) {
      throw new Error('Cannot debit a negative amount');
    }

    if (this._balance.isLessThan(amount)) {
      throw new Error('Insufficient funds');
    }

    this._balance = this._balance.subtract(amount);
    this.incrementVersion();
  }

  credit(amount: Money): void {
    this.assertSameCurrency(amount);

    if (amount.isNegative()) {
      throw new Error('Cannot credit a negative amount');
    }

    this._balance = this._balance.add(amount);
    this.incrementVersion();
  }

  private incrementVersion(): void {
    this._version += 1;
    this._updatedAt = new Date();
  }

  private assertSameCurrency(money: Money): void {
    if (this.currency !== money.currency) {
      throw new Error(`Currency mismatch: wallet is ${this.currency}, transaction is ${money.currency}`);
    }
  }

  applyTransaction(transaction: WagerTransaction): void {
    const direction = transaction.ledgerDirectionFor(); // Will throw for Loss, but Loss doesn't affect balance, handled below if Loss
    // Wait, Loss doesn't affect balance so we just return? Yes!
    if (transaction.kind === WagerTransactionKind.Loss) {
      return;
    }
    
    if (direction === LedgerDirection.Credit) {
      this.credit(transaction.money);
    } else {
      this.debit(transaction.money);
    }
  }
}

