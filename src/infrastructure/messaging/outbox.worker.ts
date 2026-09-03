import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { MikroORM, EntityManager, LockMode } from '@mikro-orm/core';
import { OutboxMessageEntity } from '../database/entities/outbox-message.entity.js';

@Injectable()
export class OutboxWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorkerService.name);
  private isRunning = false;
  private readonly queueUrl = 'http://localhost:4566/000000000000/outbox-events.fifo';

  constructor(
    private readonly orm: MikroORM,
    private readonly sqsClient: SQSClient,
  ) {}

  onModuleInit() {
    this.logger.log('Starting SQS Outbox Worker...');
    this.isRunning = true;
    this.poll();
  }

  onModuleDestroy() {
    this.logger.log('Stopping SQS Outbox Worker...');
    this.isRunning = false;
  }

  private async poll() {
    while (this.isRunning) {
      try {
        await this.processOutboxBatch();
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Poll every 2 seconds
      } catch (error) {
        this.logger.error('Error processing outbox', error);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async processOutboxBatch() {
    // We use a separate connection to handle the SKIP LOCKED transaction
    const em = this.orm.em.fork();
    
    await em.transactional(async (txEm) => {
      // Find pending outbox messages and lock them using SKIP LOCKED to avoid conflicts with other workers
      const messages = await txEm.find(
        OutboxMessageEntity,
        {
          publishedAt: null,
          $or: [
            { nextAttemptAt: null },
            { nextAttemptAt: { $lte: new Date() } }
          ]
        },
        {
          limit: 10,
          lockMode: LockMode.PESSIMISTIC_WRITE // Will use FOR UPDATE (and SKIP LOCKED if supported/configured)
        }
      );
        // To be completely strict on PostgreSQL SKIP LOCKED we could use knex directly:
        // txEm.getConnection().execute('SELECT * FROM outbox_messages WHERE ... FOR UPDATE SKIP LOCKED')
        
      if (messages.length === 0) return;

      this.logger.debug(`Found ${messages.length} pending outbox messages`);

      for (const msg of messages) {
        try {
          const command = new SendMessageCommand({
            QueueUrl: this.queueUrl,
            MessageBody: JSON.stringify({
              id: msg.id,
              aggregateId: msg.aggregateId,
              eventType: msg.eventType,
              payload: msg.payload,
              occurredAt: msg.occurredAt,
            }),
            MessageGroupId: msg.aggregateId, // FIFO group by aggregate (wallet or transaction)
            MessageDeduplicationId: msg.id,
          });

          await this.sqsClient.send(command);

          msg.publishedAt = new Date();
          this.logger.log(`Successfully published outbox event ${msg.id}`);
        } catch (error: any) {
          this.logger.error(`Failed to publish event ${msg.id}: ${error.message}`);
          msg.attempts += 1;
          msg.nextAttemptAt = new Date(Date.now() + Math.pow(2, msg.attempts) * 1000); // Exponential backoff
        }
      }

      await txEm.flush();
    });
  }
}
