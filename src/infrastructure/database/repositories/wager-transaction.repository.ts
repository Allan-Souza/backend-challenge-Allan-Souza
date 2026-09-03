import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { WagerTransaction } from '../../../domain/wager-transaction.js';
import { WagerTransactionEntity } from '../entities/wager-transaction.entity.js';

@Injectable()
export class WagerTransactionRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, { id });
    if (!entity) return null;
    return entity.toDomain();
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, { idempotencyKey });
    if (!entity) return null;
    return entity.toDomain();
  }
  
  async findByProviderAndExternalId(providerId: string, externalTransactionId: string): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, { providerId, externalTransactionId });
    if (!entity) return null;
    return entity.toDomain();
  }

  async findPendingReferences(limit: number = 50): Promise<WagerTransaction[]> {
    const entities = await this.em.find(WagerTransactionEntity, {
      status: 'PENDING_REFERENCE' as any
    }, { limit, orderBy: { createdAt: 'ASC' } });
    return entities.map(e => e.toDomain());
  }

  async save(transaction: WagerTransaction): Promise<void> {
    const entity = WagerTransactionEntity.fromDomain(transaction);
    const existing = await this.em.findOne(WagerTransactionEntity, { id: transaction.id });
    if (existing) {
        this.em.assign(existing, entity);
    } else {
        this.em.persist(entity);
    }
  }
}
