import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { WagerTransactionRepository } from '../../infrastructure/database/repositories/wager-transaction.repository.js';
import { SubmitWagerTransactionUseCase } from '../../application/use-cases/submit-wager-transaction.usecase.js';

@Controller('reconciliation')
export class ReconciliationController {
  constructor(
    private readonly transactionRepo: WagerTransactionRepository,
    private readonly submitTxUseCase: SubmitWagerTransactionUseCase,
  ) {}

  @Post('process-pending')
  @HttpCode(HttpStatus.OK)
  async triggerPendingReconciliation() {
    // This could also be a Use Case 'ProcessPendingReferencesUseCase', but for simplicity
    // we are exposing an HTTP trigger that essentially replicates what the Worker does.
    const pendingTxs = await this.transactionRepo.findPendingReferences(10);
    
    let processedCount = 0;
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
        processedCount++;
      } catch (error: any) {
        // Log error and continue
      }
    }

    return { processedCount };
  }
}
