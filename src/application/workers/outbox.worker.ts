import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MikroOrmUnitOfWork } from '../../infrastructure/database/unit-of-work.js';
import { MessagingRepository } from '../../infrastructure/database/repositories/messaging.repository.js';
// We would inject an SQS producer here, let's mock it for now or create a stub
export interface IEventPublisher {
  publish(topicOrQueueUrl: string, event: any): Promise<void>;
}

@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);
  private isProcessing = false;

  constructor(
    private readonly uow: MikroOrmUnitOfWork,
    private readonly messagingRepo: MessagingRepository,
    @Inject('IEventPublisher') private readonly eventPublisher: IEventPublisher,
  ) {}

  @Cron(CronExpression.EVERY_SECOND)
  async processOutbox() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      await this.uow.execute(async () => {
        const messages = await this.messagingRepo.findUnpublishedOutboxMessages(50);
        
        for (const message of messages) {
          try {
            // Ideally map the eventType to a specific queue URL
            const queueUrl = process.env.SQS_EVENTS_QUEUE_URL || 'dummy-url';
            
            await this.eventPublisher.publish(queueUrl, {
              id: message.id,
              eventType: message.eventType,
              payload: message.payload,
              occurredAt: message.occurredAt.toISOString(),
            });

            message.markPublished(new Date());
          } catch (error: any) {
            this.logger.error(`Failed to publish message ${message.id}: ${error.message}`);
            // Retry strategy is embedded in the scheduleRetry logic (exponential backoff)
            message.scheduleRetry(new Date());
          }

          await this.messagingRepo.saveOutboxMessage(message);
        }
      });
    } catch (err: any) {
      this.logger.error(`Error in outbox worker: ${err.message}`);
    } finally {
      this.isProcessing = false;
    }
  }
}

