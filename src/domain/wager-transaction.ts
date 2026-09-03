import { Money } from './money.js';

export enum WagerTransactionKind {
  Opening  = "OPENING",
  Bet      = "BET",
  Win      = "WIN",
  Loss     = "LOSS",
  Refund   = "REFUND",
  Rollback = "ROLLBACK",
}

export enum WagerTransactionStatus {
  Pending          = "PENDING",
  PendingReference = "PENDING_REFERENCE",
  Processed        = "PROCESSED",
  Rejected         = "REJECTED",
  Failed           = "FAILED",
}

export enum FailureCode {
  INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS",
  NEGATIVE_BALANCE = "NEGATIVE_BALANCE",
  DUPLICATE_REFERENCE = "DUPLICATE_REFERENCE",
  REFERENCE_NOT_FOUND = "REFERENCE_NOT_FOUND",
  INVALID_STATE = "INVALID_STATE",
  INVALID_CURRENCY = "INVALID_CURRENCY",
  PROVIDER_MISMATCH = "PROVIDER_MISMATCH",
  UNEXPECTED_ERROR = "UNEXPECTED_ERROR",
}

export enum LedgerDirection {
  Debit = "DEBIT",
  Credit = "CREDIT"
}

export interface CreateWagerTransactionProps {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string;
}

export interface WagerTransactionState {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: any; // We rehydrate via Money.from
  referenceExternalTransactionId?: string;
  createdAt: Date;
  status: WagerTransactionStatus;
  referenceTransactionId?: string;
  failureCode?: FailureCode;
  processedAt?: Date;
}

export class WagerTransaction {
  private constructor(
    public readonly id: string,
    public readonly providerId: string,
    public readonly externalTransactionId: string,
    public readonly idempotencyKey: string,
    public readonly payloadHash: string,
    public readonly walletId: string,
    public readonly playerId: string,
    public readonly roundId: string,
    public readonly gameId: string,
    public readonly kind: WagerTransactionKind,
    public readonly money: Money,
    public readonly referenceExternalTransactionId: string | undefined,
    public readonly createdAt: Date,
    private _status: WagerTransactionStatus,
    private _referenceTransactionId?: string,
    private _failureCode?: FailureCode,
    private _processedAt?: Date,
  ) {}

  static create(props: CreateWagerTransactionProps): WagerTransaction {
    if ((props.kind === WagerTransactionKind.Refund || props.kind === WagerTransactionKind.Rollback) && !props.referenceExternalTransactionId) {
      throw new Error(`Transaction kind ${props.kind} requires a referenceExternalTransactionId`);
    }

    if (props.kind === WagerTransactionKind.Opening) {
        throw new Error('Opening transaction cannot be created through normal flows');
    }

    return new WagerTransaction(
      props.id,
      props.providerId,
      props.externalTransactionId,
      props.idempotencyKey,
      props.payloadHash,
      props.walletId,
      props.playerId,
      props.roundId,
      props.gameId,
      props.kind,
      props.money,
      props.referenceExternalTransactionId,
      new Date(),
      WagerTransactionStatus.Pending,
    );
  }
  
  static createOpening(props: CreateWagerTransactionProps): WagerTransaction {
      return new WagerTransaction(
        props.id,
        props.providerId,
        props.externalTransactionId,
        props.idempotencyKey,
        props.payloadHash,
        props.walletId,
        props.playerId,
        props.roundId,
        props.gameId,
        WagerTransactionKind.Opening,
        props.money,
        undefined,
        new Date(),
        WagerTransactionStatus.Processed,
        undefined,
        undefined,
        new Date()
      );
  }

  static rehydrate(state: WagerTransactionState): WagerTransaction {
    return new WagerTransaction(
      state.id,
      state.providerId,
      state.externalTransactionId,
      state.idempotencyKey,
      state.payloadHash,
      state.walletId,
      state.playerId,
      state.roundId,
      state.gameId,
      state.kind,
      Money.from(state.money),
      state.referenceExternalTransactionId,
      state.createdAt,
      state.status,
      state.referenceTransactionId,
      state.failureCode,
      state.processedAt,
    );
  }

  get status(): WagerTransactionStatus { return this._status; }
  get referenceTransactionId(): string | undefined { return this._referenceTransactionId; }
  get failureCode(): FailureCode | undefined { return this._failureCode; }
  get processedAt(): Date | undefined { return this._processedAt; }

  markProcessed(referenceTransactionId: string | undefined, at: Date): void {
    if (this.isTerminal()) {
      throw new Error(`Cannot transition from terminal state ${this._status}`);
    }
    this._status = WagerTransactionStatus.Processed;
    this._referenceTransactionId = referenceTransactionId;
    this._processedAt = at;
  }

  markPendingReference(): void {
    if (this.isTerminal()) {
      throw new Error(`Cannot transition from terminal state ${this._status}`);
    }
    this._status = WagerTransactionStatus.PendingReference;
  }

  reject(code: FailureCode): void {
    if (this.isTerminal()) {
      throw new Error(`Cannot transition from terminal state ${this._status}`);
    }
    this._status = WagerTransactionStatus.Rejected;
    this._failureCode = code;
  }

  fail(code: FailureCode): void {
    if (this.isTerminal()) {
      throw new Error(`Cannot transition from terminal state ${this._status}`);
    }
    this._status = WagerTransactionStatus.Failed;
    this._failureCode = code;
  }

  isTerminal(): boolean {
    return [
      WagerTransactionStatus.Processed,
      WagerTransactionStatus.Rejected,
      WagerTransactionStatus.Failed,
    ].includes(this._status);
  }

  affectsBalance(): boolean {
    return this.kind !== WagerTransactionKind.Loss;
  }

  requiresReference(): boolean {
    return this.kind === WagerTransactionKind.Refund || this.kind === WagerTransactionKind.Rollback;
  }

  matchesPayload(payloadHash: string): boolean {
    return this.payloadHash === payloadHash;
  }

  ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection {
    switch (this.kind) {
      case WagerTransactionKind.Opening:
      case WagerTransactionKind.Win:
      case WagerTransactionKind.Refund:
        return LedgerDirection.Credit;
      case WagerTransactionKind.Bet:
        return LedgerDirection.Debit;
      case WagerTransactionKind.Rollback:
        if (!reference) throw new Error("Rollback requires reference to determine ledger direction");
        // Rollback invert the reference direction
        const refDirection = reference.ledgerDirectionFor();
        return refDirection === LedgerDirection.Credit ? LedgerDirection.Debit : LedgerDirection.Credit;
      case WagerTransactionKind.Loss:
        throw new Error("Loss does not have a ledger direction");
      default:
        throw new Error(`Unknown kind ${this.kind}`);
    }
  }
}
