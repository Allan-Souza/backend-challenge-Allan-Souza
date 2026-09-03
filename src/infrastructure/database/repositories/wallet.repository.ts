import { Injectable } from '@nestjs/common';
import { EntityManager, LockMode } from '@mikro-orm/core';
import { Wallet } from '../../../domain/wallet.js';
import { WalletEntity } from '../entities/wallet.entity.js';

@Injectable()
export class WalletRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string, lock: boolean = false): Promise<Wallet | null> {
    const entity = await this.em.findOne(WalletEntity, { id }, { 
        lockMode: lock ? LockMode.OPTIMISTIC : LockMode.NONE 
    });
    if (!entity) return null;
    return entity.toDomain();
  }

  async findByPlayerAndCurrency(playerId: string, currency: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(WalletEntity, { playerId, currency });
    if (!entity) return null;
    return entity.toDomain();
  }

  async save(wallet: Wallet): Promise<void> {
    const entity = WalletEntity.fromDomain(wallet);
    const existing = await this.em.findOne(WalletEntity, { id: wallet.id });
    if (existing) {
      // Omit version so MikroORM handles the optimistic lock based on the loaded version
      const { version, ...updateData } = entity as any;
      this.em.assign(existing, updateData);
    } else {
      this.em.persist(entity);
    }
  }
}
