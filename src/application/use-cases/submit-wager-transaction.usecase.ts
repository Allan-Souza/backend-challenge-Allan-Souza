import { Injectable } from '@nestjs/common';
import { MikroOrmUnitOfWork } from '../../infrastructure/database/unit-of-work.js';
import { WalletRepository } from '../../infrastructure/database/repositories/wallet.repository.js';
import { WagerTransactionRepository } from '../../infrastructure/database/repositories/wager-transaction.repository.js';
import { WalletLedgerRepository } from '../../infrastructure/database/repositories/wallet-ledger.repository.js';
import { MessagingRepository } from '../../infrastructure/database/repositories/messaging.repository.js';
import { Wallet } from '../../domain/wallet.js';
import { Money } from '../../domain/money.js';
import { WagerTransaction, WagerTransactionKind, WagerTransactionStatus, FailureCode, LedgerDirection } from '../../domain/wager-transaction.js';
import { WalletLedgerEntry } from '../../domain/wallet-ledger-entry.js';
import { OutboxMessage, InboxMessage } from '../../domain/messaging.js';
import { v7 as uuidv7 } from 'uuid';

export interface SubmitWagerTransactionCommand {
  providerId: string;
  externalTransactionId: string;
  payloadHash: string; // Used for exact idempotency checks later
  playerId: string;
  currency: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  moneyAmount: string;
  referenceExternalTransactionId?: string;
  inbox?: {
    messageId: string;
    consumerName: string;
    payloadHash: string;
    receivedAt: Date;
  };
}

@Injectable()
export class SubmitWagerTransactionUseCase {
  constructor(
    private readonly uow: MikroOrmUnitOfWork,
    private readonly walletRepo: WalletRepository,
    private readonly transactionRepo: WagerTransactionRepository,
    private readonly ledgerRepo: WalletLedgerRepository,
    private readonly messagingRepo: MessagingRepository,
  ) {}

  async execute(command: SubmitWagerTransactionCommand): Promise<WagerTransaction> {
    const idempotencyKey = `${command.providerId}:${command.externalTransactionId}`;

    return this.uow.execute(async () => {
      // 1. Idempotency Check
      const existingTx = await this.transactionRepo.findByIdempotencyKey(idempotencyKey);
      if (existingTx) {
        if (existingTx.payloadHash !== command.payloadHash) {
          throw new Error('Idempotency collision: same external ID but different payload');
        }
        return existingTx; // Return idempotently
      }

      // 2. Process Inbox if provided (idempotency via InboxMessage)
      if (command.inbox) {
        const existingInbox = await this.messagingRepo.findInboxMessage(command.inbox.consumerName, command.inbox.messageId);
        if (existingInbox) {
           throw new Error('InboxMessage collision: message already processed');
        }
      }

      // 3. Fetch Wallet with Optimistic Locking
      const wallet = await this.walletRepo.findByPlayerAndCurrency(command.playerId, command.currency.toUpperCase());
      if (!wallet) {
        throw new Error(`Wallet not found for player ${command.playerId} and currency ${command.currency}`);
      }

      // 3. Resolve Reference Transaction (for REFUND or WIN)
      let referenceTransactionId: string | undefined = undefined;
      let status = WagerTransactionStatus.Processed;
      let failureCode: FailureCode | undefined = undefined;

      if (command.kind === WagerTransactionKind.Refund || command.kind === WagerTransactionKind.Win || command.kind === WagerTransactionKind.Rollback) {
        if (!command.referenceExternalTransactionId) {
          status = WagerTransactionStatus.Failed;
          failureCode = FailureCode.REFERENCE_NOT_FOUND;
        } else {
          const refTx = await this.transactionRepo.findByProviderAndExternalId(command.providerId, command.referenceExternalTransactionId);
          if (!refTx) {
            status = WagerTransactionStatus.PendingReference;
          } else {
            referenceTransactionId = refTx.id;
          }
        }
      }

      const txId = uuidv7();
      const money = Money.from({ amount: command.moneyAmount, currency: command.currency });

      // 4. Create Transaction
      // Note: we can't create it with arbitrary status directly if we use `create()`, we should create and then transition.
      const transaction = WagerTransaction.create({
        id: txId,
        providerId: command.providerId,
        externalTransactionId: command.externalTransactionId,
        idempotencyKey,
        payloadHash: command.payloadHash,
        walletId: wallet.id,
        playerId: command.playerId,
        roundId: command.roundId,
        gameId: command.gameId,
        kind: command.kind,
        money,
        referenceExternalTransactionId: command.referenceExternalTransactionId,
      });

      // Override state based on our checks
      if (status === WagerTransactionStatus.Failed) {
        transaction.fail(failureCode!);
      } else if (status === WagerTransactionStatus.PendingReference) {
        transaction.markPendingReference();
      }

      // 5. Apply to Wallet if Processed
      if (transaction.status === WagerTransactionStatus.Pending) { // Pending is the default from create()
        try {
          const balanceBefore = wallet.balance;

          wallet.applyTransaction(transaction); // Wallet will apply logic based on kind

          const direction = transaction.ledgerDirectionFor(undefined as any); // Assuming for Bet/Win/Refund it doesn't strictly need the ref instance
          const ledgerEntry = WalletLedgerEntry.create({
            id: uuidv7(),
            walletId: wallet.id,
            transactionId: transaction.id,
            direction,
            money,
            balanceBefore,
            balanceAfter: wallet.balance,
          });
          await this.ledgerRepo.save(ledgerEntry);
          
          transaction.markProcessed(referenceTransactionId, new Date());

        } catch (error: any) {
          if (error.message.includes('Insufficient funds')) {
            transaction.fail(FailureCode.INSUFFICIENT_FUNDS);
          } else {
            transaction.fail(FailureCode.INVALID_STATE);
          }
        }
      }

      // 6. Save Entities
      await this.transactionRepo.save(transaction);
      await this.walletRepo.save(wallet); // Optimistic lock happens here upon commit

      // 7. Emit Integration Event via Outbox
      const outboxEvent = OutboxMessage.create({
        id: uuidv7(),
        aggregateId: transaction.id,
        eventType: 'WagerTransactionCreated',
        payload: {
          transactionId: transaction.id,
          walletId: wallet.id,
          status: transaction.status,
          kind: transaction.kind,
          money: transaction.money.toJSON(),
        }
      });
      await this.messagingRepo.saveOutboxMessage(outboxEvent);

      if (command.inbox) {
        const inboxMsg = InboxMessage.receive({
          messageId: command.inbox.messageId,
          consumerName: command.inbox.consumerName,
          payloadHash: command.inbox.payloadHash,
          receivedAt: command.inbox.receivedAt,
        });
        inboxMsg.markProcessed(new Date());
        await this.messagingRepo.saveInboxMessage(inboxMsg);
      }

      return transaction;
    });
  }
}

