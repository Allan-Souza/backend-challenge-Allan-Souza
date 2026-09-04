import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus, Headers, NotFoundException, ConflictException, Query } from '@nestjs/common';
import { SubmitWagerTransactionUseCase } from '../../application/use-cases/submit-wager-transaction.usecase.js';
import { WagerTransactionRepository } from '../../infrastructure/database/repositories/wager-transaction.repository.js';
import { WalletRepository } from '../../infrastructure/database/repositories/wallet.repository.js';
import { WagerTransactionKind, WagerTransactionStatus } from '../../domain/wager-transaction.js';
import * as crypto from 'crypto';

class SubmitTransactionDto {
  providerId!: string;
  externalTransactionId!: string;
  playerId!: string;
  walletId!: string;
  roundId!: string;
  gameId!: string;
  kind!: WagerTransactionKind;
  money!: { amount: string; currency: string };
  referenceExternalTransactionId?: string;
}

@Controller('wagering/transactions')
export class TransactionController {
  constructor(
    private readonly submitTransactionUseCase: SubmitWagerTransactionUseCase,
    private readonly transactionRepo: WagerTransactionRepository,
    private readonly walletRepo: WalletRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async submitTransaction(
    @Body() dto: SubmitTransactionDto,
    @Headers('idempotency-key') idempotencyKeyHeader: string,
  ) {
    if (!idempotencyKeyHeader) {
      throw new ConflictException('Idempotency-Key header is required');
    }

    // Generate payloadHash from canonical JSON (sorted keys) of business fields only
    const businessPayload = {
      externalTransactionId: dto.externalTransactionId,
      gameId: dto.gameId,
      kind: dto.kind,
      money: dto.money,
      playerId: dto.playerId,
      providerId: dto.providerId,
      referenceExternalTransactionId: dto.referenceExternalTransactionId,
      roundId: dto.roundId,
      walletId: dto.walletId,
    };
    const canonicalJson = JSON.stringify(businessPayload, Object.keys(businessPayload).sort());
    const payloadHash = crypto.createHash('sha256').update(canonicalJson).digest('hex');

    const tx = await this.submitTransactionUseCase.execute({
      providerId: dto.providerId,
      externalTransactionId: dto.externalTransactionId,
      payloadHash,
      playerId: dto.playerId,
      currency: dto.money.currency,
      roundId: dto.roundId,
      gameId: dto.gameId,
      kind: dto.kind,
      moneyAmount: dto.money.amount,
      referenceExternalTransactionId: dto.referenceExternalTransactionId,
    });

    // Fetch current wallet balance to include in response
    const wallet = await this.walletRepo.findByPlayerAndCurrency(dto.playerId, dto.money.currency);

    // Determine if this was an idempotent replay
    const isReplay = tx.createdAt.getTime() < Date.now() - 1000; // If created >1s ago, it's a replay

    return {
      transactionId: tx.id,
      status: tx.status,
      balance: wallet ? wallet.balance.toJSON() : undefined,
      idempotentReplay: isReplay,
      failureCode: tx.failureCode,
    };
  }

  @Get(':transactionId')
  async getTransaction(@Param('transactionId') transactionId: string) {
    const tx = await this.transactionRepo.findById(transactionId);
    if (!tx) {
      throw new NotFoundException(`Transaction ${transactionId} not found`);
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
