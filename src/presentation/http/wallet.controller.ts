import { Controller, Post, Body, HttpCode, HttpStatus, Get, Param, NotFoundException } from '@nestjs/common';
import { CreateWalletUseCase } from '../../application/use-cases/create-wallet.usecase.js';
import { WalletRepository } from '../../infrastructure/database/repositories/wallet.repository.js';

class CreateWalletDto {
  playerId!: string;
  initialBalanceAmount!: string;
  currency!: string;
}

@Controller('wallets')
export class WalletController {
  constructor(
    private readonly createWalletUseCase: CreateWalletUseCase,
    private readonly walletRepo: WalletRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createWallet(@Body() dto: CreateWalletDto) {
    const wallet = await this.createWalletUseCase.execute({
      playerId: dto.playerId,
      initialBalanceAmount: dto.initialBalanceAmount,
      currency: dto.currency,
    });
    
    return {
      walletId: wallet.id,
      playerId: wallet.playerId,
      currency: wallet.currency,
      balance: wallet.balance.toJSON().amount,
    };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getWallet(@Param('id') id: string) {
    const wallet = await this.walletRepo.findById(id);
    if (!wallet) {
      throw new NotFoundException(`Wallet not found`);
    }

    return {
      walletId: wallet.id,
      playerId: wallet.playerId,
      currency: wallet.currency,
      balance: wallet.balance.toJSON().amount,
    };
  }
}
