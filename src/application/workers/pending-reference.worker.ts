import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { MikroOrmUnitOfWork } from '../../infrastructure/database/unit-of-work.js';
import { WagerTransactionRepository } from '../../infrastructure/database/repositories/wager-transaction.repository.js';
import { SubmitWagerTransactionUseCase } from '../use-cases/submit-wager-transaction.usecase.js';

@Injectable()
export class PendingReferenceWorker {
  private readonly logger = new Logger(PendingReferenceWorker.name);
  private isProcessing = false;

  constructor(
    private readonly orm: MikroORM,
    private readonly uow: MikroOrmUnitOfWork,
    private readonly transactionRepo: WagerTransactionRepository,
    private readonly submitTxUseCase: SubmitWagerTransactionUseCase,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingReferences() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      await RequestContext.create(this.orm.em, async () => {
        const pendingTxs = await this.transactionRepo.findPendingReferences(50);
        
        for (const pendingTx of pendingTxs) {
          try {
            await this.submitTxUseCase.execute({
              providerId: pendingTx.providerId,
              externalTransactionId: pendingTx.externalTransactionId,
              payloadHash: pendingTx.payloadHash,
              playerId: pendingTx.playerId,
              currency: pendingTx.money.currency,
              roundId: pendingTx.roundId,
              gameId: pendingTx.gameId,
              kind: pendingTx.kind,
              moneyAmount: pendingTx.money.toJSON().amount,
              referenceExternalTransactionId: pendingTx.referenceExternalTransactionId,
            });
          } catch (error: any) {
            this.logger.error(`Failed to process pending tx ${pendingTx.id}: ${error.message}`);
          }
        }
      });
    } catch (err: any) {
      this.logger.error(`Error in pending reference worker: ${err.message}`);
    } finally {
      this.isProcessing = false;
    }
  }
}
