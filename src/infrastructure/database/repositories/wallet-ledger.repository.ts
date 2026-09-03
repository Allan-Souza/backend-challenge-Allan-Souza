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
}
