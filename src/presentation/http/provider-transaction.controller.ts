import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { WagerTransactionRepository } from '../../infrastructure/database/repositories/wager-transaction.repository.js';

@Controller('providers')
export class ProviderTransactionController {
  constructor(private readonly transactionRepo: WagerTransactionRepository) {}

  @Get(':providerId/wagering/transactions/:externalTransactionId')
  async getByProvider(
    @Param('providerId') providerId: string,
    @Param('externalTransactionId') externalTransactionId: string,
  ) {
    const tx = await this.transactionRepo.findByProviderAndExternalId(providerId, externalTransactionId);
    if (!tx) {
      throw new NotFoundException(`Transaction not found for provider ${providerId} / external ID ${externalTransactionId}`);
    }
    return {
      transactionId: tx.id,
      providerId: tx.providerId,
      externalTransactionId: tx.externalTransactionId,
      playerId: tx.playerId,
      walletId: tx.walletId,
      roundId: tx.roundId,
      gameId: tx.gameId,
      kind: tx.kind,
      money: tx.money.toJSON(),
      status: tx.status,
      failureCode: tx.failureCode,
      referenceExternalTransactionId: tx.referenceExternalTransactionId,
      createdAt: tx.createdAt.toISOString(),
      processedAt: tx.processedAt?.toISOString(),
    };
  }
}
