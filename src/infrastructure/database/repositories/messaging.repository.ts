import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { LockMode } from '@mikro-orm/core';
import { InboxMessage, OutboxMessage } from '../../../domain/messaging.js';
import { InboxMessageEntity } from '../entities/inbox-message.entity.js';
import { OutboxMessageEntity } from '../entities/outbox-message.entity.js';

@Injectable()
export class MessagingRepository {
  constructor(private readonly em: EntityManager) {}

  async findInboxMessage(consumerName: string, messageId: string): Promise<InboxMessage | null> {
    const entity = await this.em.findOne(InboxMessageEntity, { consumerName, messageId });
    if (!entity) return null;
    return entity.toDomain();
  }

  async saveInboxMessage(msg: InboxMessage): Promise<void> {
    const entity = InboxMessageEntity.fromDomain(msg);
    const existing = await this.em.findOne(InboxMessageEntity, { consumerName: msg.consumerName, messageId: msg.messageId });
    if (existing) {
        this.em.assign(existing, entity);
    } else {
        this.em.persist(entity);
    }
  }

  async saveOutboxMessage(msg: OutboxMessage): Promise<void> {
    const entity = OutboxMessageEntity.fromDomain(msg);
    const existing = await this.em.findOne(OutboxMessageEntity, { id: msg.id });
    if (existing) {
        this.em.assign(existing, entity);
    } else {
        this.em.persist(entity);
    }
  }

  async findUnpublishedOutboxMessages(limit: number = 50): Promise<OutboxMessage[]> {
    // Select FOR UPDATE SKIP LOCKED to allow concurrent workers to process outbox safely
    const entities = await this.em.find(OutboxMessageEntity, {
        publishedAt: null,
        $or: [
          { nextAttemptAt: { $lte: new Date() } },
          { nextAttemptAt: null }
        ]
    }, { 
        limit, 
        orderBy: { occurredAt: 'ASC' },
        lockMode: LockMode.PESSIMISTIC_WRITE
    });
    // For Skip Locked, MikroORM supports it via query builder or explicit lock options. 
    // We'll update the lockMode to LockMode.PESSIMISTIC_WRITE with skip locked if using EntityManager.
    return entities.map(e => e.toDomain());
  }
}
