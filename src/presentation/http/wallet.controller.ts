import { Controller, Post, Get, Param, Query, HttpCode, HttpStatus, NotFoundException } from '@nestjs/common';
import { CreateWalletUseCase } from '../../application/use-cases/create-wallet.usecase.js';
import { WalletRepository } from '../../infrastructure/database/repositories/wallet.repository.js';
import { WalletLedgerRepository } from '../../infrastructure/database/repositories/wallet-ledger.repository.js';
import { Body } from '@nestjs/common';

class CreateWalletDto {
  playerId!: string;
  initialBalance!: { amount: string; currency: string };
}

@Controller('wallets')
export class WalletController {
  constructor(
    private readonly createWalletUseCase: CreateWalletUseCase,
    private readonly walletRepo: WalletRepository,
    private readonly ledgerRepo: WalletLedgerRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createWallet(@Body() dto: CreateWalletDto) {
    const wallet = await this.createWalletUseCase.execute({
      playerId: dto.playerId,
      initialBalanceAmount: dto.initialBalance.amount,
      currency: dto.initialBalance.currency,
    });
    
    return {
      id: wallet.id,
      playerId: wallet.playerId,
      balance: wallet.balance.toJSON(),
      version: wallet.version,
    };
  }

  @Get(':walletId')
  async getWallet(@Param('walletId') walletId: string) {
    const wallet = await this.walletRepo.findById(walletId);
    if (!wallet) {
      throw new NotFoundException(`Wallet not found`);
    }

    return {
      id: wallet.id,
      playerId: wallet.playerId,
      balance: wallet.balance.toJSON(),
      version: wallet.version,
    };
  }

  @Get(':walletId/ledger')
  async getLedger(
    @Param('walletId') walletId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const wallet = await this.walletRepo.findById(walletId);
    if (!wallet) {
      throw new NotFoundException(`Wallet not found`);
    }

    const pageLimit = Math.min(parseInt(limit || '50', 10), 100);
    const entries = await this.ledgerRepo.findByWalletId(walletId, cursor, pageLimit);

    const nextCursor = entries.length === pageLimit ? entries[entries.length - 1].id : undefined;

    return {
      walletId,
      entries: entries.map(e => ({
        id: e.id,
        transactionId: e.transactionId,
        direction: e.direction,
        money: e.money.toJSON(),
        balanceBefore: e.balanceBefore.toJSON(),
        balanceAfter: e.balanceAfter.toJSON(),
        createdAt: e.createdAt.toISOString(),
      })),
      cursor: nextCursor,
      limit: pageLimit,
    };
  }

  @Post(':walletId/reconciliation')
  @HttpCode(HttpStatus.OK)
  async reconcile(@Param('walletId') walletId: string) {
    const wallet = await this.walletRepo.findById(walletId);
    if (!wallet) {
      throw new NotFoundException(`Wallet not found`);
    }

    // Get all ledger entries for this wallet
    const allEntries = await this.ledgerRepo.findByWalletId(walletId, undefined, 10000);
    
    // Calculate balance from ledger
    const { Money } = await import('../../domain/money.js');
    let calculatedBalance = Money.zero(wallet.balance.currency);
    for (const entry of allEntries) {
      if (entry.direction === 'CREDIT') {
        calculatedBalance = calculatedBalance.add(entry.money);
      } else {
        calculatedBalance = calculatedBalance.subtract(entry.money);
      }
    }

    const storedBalance = wallet.balance;
    const difference = storedBalance.subtract(calculatedBalance);
    const consistent = difference.isZero();

    if (!consistent) {
      // Log divergence (structured logging via pino will pick this up)
      console.error(`[RECONCILIATION] Divergence detected for wallet ${walletId}: stored=${storedBalance.toString()}, calculated=${calculatedBalance.toString()}, diff=${difference.toString()}`);
    }

    return {
      walletId,
      storedBalance: storedBalance.toJSON(),
      calculatedBalance: calculatedBalance.toJSON(),
      difference: difference.toJSON(),
      consistent,
      checkedEntries: allEntries.length,
    };
  }
}
