import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { WalletLedgerEntry } from '../../../domain/wallet-ledger-entry.js';
import { WalletLedgerEntity } from '../entities/wallet-ledger.entity.js';

@Injectable()
export class WalletLedgerRepository {
  constructor(private readonly em: EntityManager) {}

  async save(entry: WalletLedgerEntry): Promise<void> {
    const entity = WalletLedgerEntity.fromDomain(entry);
    this.em.persist(entity);
  }

  async findByWalletId(walletId: string, cursor?: string, limit: number = 50): Promise<WalletLedgerEntry[]> {
    const where: any = { walletId };
    if (cursor) {
      where.id = { $gt: cursor };
    }
    const entities = await this.em.find(WalletLedgerEntity, where, {
      orderBy: { createdAt: 'ASC', id: 'ASC' },
      limit,
    });
    return entities.map(e => e.toDomain());
  }
}
