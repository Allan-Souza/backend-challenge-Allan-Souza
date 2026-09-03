import { Injectable, Logger } from '@nestjs/common';
import { SubmitWagerTransactionUseCase } from '../../application/use-cases/submit-wager-transaction.usecase.js';
import { MessagingRepository } from '../../infrastructure/database/repositories/messaging.repository.js';
import { InboxMessage } from '../../domain/messaging.js';
import { MikroOrmUnitOfWork } from '../../infrastructure/database/unit-of-work.js';
import { WagerTransactionKind } from '../../domain/wager-transaction.js';
import * as crypto from 'crypto';

@Injectable()
export class SqsConsumer {
  private readonly logger = new Logger(SqsConsumer.name);

  constructor(
    private readonly submitTxUseCase: SubmitWagerTransactionUseCase,
    private readonly messagingRepo: MessagingRepository,
    private readonly uow: MikroOrmUnitOfWork,
  ) {}

  // In a real NestJS app, you'd use a package like @nestjs/microservices or an SQS poller
  // to wire this method up to the actual queue.
  async handleMessage(messageId: string, payload: any) {
    const consumerName = 'WagerTransactionConsumer';
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

    await this.uow.execute(async () => {
      // Inbox pattern check
      const existingInboxMsg = await this.messagingRepo.findInboxMessage(consumerName, messageId);
      if (existingInboxMsg) {
        this.logger.debug(`Message ${messageId} already processed (Inbox).`);
        return;
      }

      const inboxMsg = InboxMessage.receive({
        messageId,
        consumerName,
        payloadHash,
      });

      // Process business logic
      if (payload.eventType === 'TransactionSubmitted') {
        await this.submitTxUseCase.execute({
          providerId: payload.providerId,
          externalTransactionId: payload.externalTransactionId,
          payloadHash,
          playerId: payload.playerId,
          currency: payload.currency,
          roundId: payload.roundId,
          gameId: payload.gameId,
          kind: payload.kind as WagerTransactionKind,
          moneyAmount: payload.moneyAmount,
          referenceExternalTransactionId: payload.referenceExternalTransactionId,
        });
      }

      inboxMsg.markProcessed(new Date());
      await this.messagingRepo.saveInboxMessage(inboxMsg);
    });
  }
}
