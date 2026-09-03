import { Injectable } from '@nestjs/common';
import { MikroOrmUnitOfWork } from '../../infrastructure/database/unit-of-work.js';
import { WalletRepository } from '../../infrastructure/database/repositories/wallet.repository.js';
import { WagerTransactionRepository } from '../../infrastructure/database/repositories/wager-transaction.repository.js';
import { WalletLedgerRepository } from '../../infrastructure/database/repositories/wallet-ledger.repository.js';
import { Wallet } from '../../domain/wallet.js';
import { Money } from '../../domain/money.js';
import { WagerTransaction, CreateWagerTransactionProps, LedgerDirection } from '../../domain/wager-transaction.js';
import { WalletLedgerEntry } from '../../domain/wallet-ledger-entry.js';
import { v7 as uuidv7 } from 'uuid';

export interface CreateWalletCommand {
  playerId: string;
  initialBalanceAmount: string;
  currency: string;
}

@Injectable()
export class CreateWalletUseCase {
  constructor(
    private readonly uow: MikroOrmUnitOfWork,
    private readonly walletRepo: WalletRepository,
    private readonly transactionRepo: WagerTransactionRepository,
    private readonly ledgerRepo: WalletLedgerRepository,
  ) {}

  async execute(command: CreateWalletCommand): Promise<Wallet> {
    const currency = command.currency.toUpperCase();
    const initialMoney = Money.from({ amount: command.initialBalanceAmount, currency });

    // Check if wallet already exists for this player and currency
    const existing = await this.walletRepo.findByPlayerAndCurrency(command.playerId, currency);
    if (existing) {
      throw new Error('Wallet already exists for this player and currency');
    }

    const walletId = uuidv7();

    return this.uow.execute(async () => {
      const wallet = Wallet.open({
        id: walletId,
        playerId: command.playerId,
        initialBalance: initialMoney,
      });

      await this.walletRepo.save(wallet);

      if (initialMoney.isPositive()) {
        const transactionId = uuidv7();
        
        // Internal Opening Transaction
        const transaction = WagerTransaction.createOpening({
          id: transactionId,
          providerId: 'INTERNAL',
          externalTransactionId: `open-${walletId}`,
          idempotencyKey: `INTERNAL:open-${walletId}`,
          payloadHash: 'N/A', // Opening transactions are internal, no HTTP payload
          walletId,
          playerId: command.playerId,
          roundId: 'N/A',
          gameId: 'N/A',
          kind: null as any, // It's overwritten in createOpening
          money: initialMoney,
        });

        await this.transactionRepo.save(transaction);

        // Ledger Entry
        const ledgerEntry = WalletLedgerEntry.create({
          id: uuidv7(),
          walletId,
          transactionId,
          direction: LedgerDirection.Credit,
          money: initialMoney,
          balanceBefore: Money.zero(currency),
          balanceAfter: initialMoney,
        });

        await this.ledgerRepo.save(ledgerEntry);
      }

      return wallet;
    });
  }
}
