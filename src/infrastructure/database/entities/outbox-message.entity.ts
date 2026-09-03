import { EntitySchema } from '@mikro-orm/core';
import { OutboxMessage } from '../../../domain/messaging.js';

export class OutboxMessageEntity {
  id!: string;
  aggregateId!: string;
  eventType!: string;
  payload!: Record<string, unknown>;
  occurredAt!: Date;
  attempts!: number;
  nextAttemptAt?: Date;
  publishedAt?: Date;

  toDomain(): OutboxMessage {
    return OutboxMessage.rehydrate({
      id: this.id,
      aggregateId: this.aggregateId,
      eventType: this.eventType,
      payload: this.payload,
      occurredAt: this.occurredAt,
      attempts: this.attempts,
      nextAttemptAt: this.nextAttemptAt,
      publishedAt: this.publishedAt,
    });
  }

  static fromDomain(msg: OutboxMessage): OutboxMessageEntity {
    const entity = new OutboxMessageEntity();
    entity.id = msg.id;
    entity.aggregateId = msg.aggregateId;
    entity.eventType = msg.eventType;
    entity.payload = msg.payload;
    entity.occurredAt = msg.occurredAt;
    entity.attempts = msg.attempts;
    entity.nextAttemptAt = msg.nextAttemptAt;
    entity.publishedAt = msg.publishedAt;
    return entity;
  }
}

export const OutboxMessageSchema = new EntitySchema<OutboxMessageEntity>({
  class: OutboxMessageEntity,
  tableName: 'outbox_messages',
  indexes: [
    { properties: ['publishedAt'] },
    { properties: ['nextAttemptAt'] }
  ],
  properties: {
    id: { type: 'string', primary: true },
    aggregateId: { type: 'string' },
    eventType: { type: 'string' },
    payload: { type: 'json' },
    occurredAt: { type: 'Date' },
    attempts: { type: 'number' },
    nextAttemptAt: { type: 'Date', nullable: true },
    publishedAt: { type: 'Date', nullable: true },
  },
});

