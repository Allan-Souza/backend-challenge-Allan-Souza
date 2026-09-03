import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MikroOrmUnitOfWork } from '../../infrastructure/database/unit-of-work.js';
import { WagerTransactionRepository } from '../../infrastructure/database/repositories/wager-transaction.repository.js';
import { SubmitWagerTransactionUseCase } from '../use-cases/submit-wager-transaction.usecase.js';

@Injectable()
export class PendingReferenceWorker {
  private readonly logger = new Logger(PendingReferenceWorker.name);
  private isProcessing = false;

  constructor(
    private readonly uow: MikroOrmUnitOfWork,
    private readonly transactionRepo: WagerTransactionRepository,
    private readonly submitTxUseCase: SubmitWagerTransactionUseCase,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingReferences() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // NOTE: We don't wrap the entire fetch in a transaction here because each re-submission
      // will open its own transaction. We fetch a batch, then iterate.
      const pendingTxs = await this.transactionRepo.findPendingReferences(50);
      
      for (const pendingTx of pendingTxs) {
        try {
          // Re-submit using the existing use case
          // It will idempotently check if it already exists and retry the reference resolution
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
          // If it fails again, it stays in PENDING_REFERENCE or fails permanently depending on the error
        }
      }
    } catch (err: any) {
      this.logger.error(`Error in pending reference worker: ${err.message}`);
    } finally {
      this.isProcessing = false;
    }
  }
}
