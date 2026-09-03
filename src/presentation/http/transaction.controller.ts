import { Controller, Post, Body, HttpCode, HttpStatus, Headers } from '@nestjs/common';
import { SubmitWagerTransactionUseCase } from '../../application/use-cases/submit-wager-transaction.usecase.js';
import { WagerTransactionKind } from '../../domain/wager-transaction.js';
import * as crypto from 'crypto';

class SubmitTransactionDto {
  providerId!: string;
  externalTransactionId!: string;
  playerId!: string;
  currency!: string;
  roundId!: string;
  gameId!: string;
  kind!: WagerTransactionKind;
  moneyAmount!: string;
  referenceExternalTransactionId?: string;
}

@Controller('transactions')
export class TransactionController {
  constructor(private readonly submitTransactionUseCase: SubmitWagerTransactionUseCase) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async submitTransaction(
    @Body() dto: SubmitTransactionDto,
    @Headers('idempotency-key') idempotencyKeyHeader: string,
  ) {
    // Generate a payload hash for exact idempotency checks
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(dto)).digest('hex');

    const tx = await this.submitTransactionUseCase.execute({
      providerId: dto.providerId,
      externalTransactionId: dto.externalTransactionId,
      payloadHash,
      playerId: dto.playerId,
      currency: dto.currency,
      roundId: dto.roundId,
      gameId: dto.gameId,
      kind: dto.kind,
      moneyAmount: dto.moneyAmount,
      referenceExternalTransactionId: dto.referenceExternalTransactionId,
    });
    
    return {
      transactionId: tx.id,
      status: tx.status,
      failureCode: tx.failureCode,
      balanceAfter: undefined // Could be fetched if needed, but not strictly required
    };
  }
}
