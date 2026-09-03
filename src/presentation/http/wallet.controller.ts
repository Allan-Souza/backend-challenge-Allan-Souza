import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { CreateWalletUseCase } from '../../application/use-cases/create-wallet.usecase.js';

class CreateWalletDto {
  playerId!: string;
  initialBalanceAmount!: string;
  currency!: string;
}

@Controller('wallets')
export class WalletController {
  constructor(private readonly createWalletUseCase: CreateWalletUseCase) {}

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
}
