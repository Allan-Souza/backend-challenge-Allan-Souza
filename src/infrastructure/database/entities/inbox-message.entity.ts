import { EntitySchema } from '@mikro-orm/core';
import { InboxMessage } from '../../../domain/messaging.js';

export class InboxMessageEntity {
  messageId!: string;
  consumerName!: string;
  payloadHash!: string;
  receivedAt!: Date;
  processedAt?: Date;

  toDomain(): InboxMessage {
    return InboxMessage.rehydrate({
      messageId: this.messageId,
      consumerName: this.consumerName,
      payloadHash: this.payloadHash,
      receivedAt: this.receivedAt,
      processedAt: this.processedAt,
    });
  }

  static fromDomain(msg: InboxMessage): InboxMessageEntity {
    const entity = new InboxMessageEntity();
    entity.messageId = msg.messageId;
    entity.consumerName = msg.consumerName;
    entity.payloadHash = msg.payloadHash;
    entity.receivedAt = msg.receivedAt;
    entity.processedAt = msg.processedAt;
    return entity;
  }
}

export const InboxMessageSchema = new EntitySchema<InboxMessageEntity>({
  class: InboxMessageEntity,
  tableName: 'inbox_messages',
  properties: {
    messageId: { type: 'string', primary: true },
    consumerName: { type: 'string', primary: true },
    payloadHash: { type: 'string' },
    receivedAt: { type: 'Date' },
    processedAt: { type: 'Date', nullable: true },
  },
});

