import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, ChangeMessageVisibilityCommand } from '@aws-sdk/client-sqs';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { SubmitWagerTransactionUseCase } from '../../application/use-cases/submit-wager-transaction.usecase.js';
import { WagerTransactionKind } from '../../domain/wager-transaction.js';

@Injectable()
export class InboxWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InboxWorkerService.name);
  private isRunning = false;
  private activeMessages = 0;
  private shutdownResolve?: () => void;
  private readonly queueUrl = process.env.SQS_WAGER_QUEUE_URL || 'http://localhost:4566/000000000000/wager-transactions.fifo';
  private readonly consumerName = 'inbox-worker-1';

  constructor(
    private readonly orm: MikroORM,
    private readonly sqsClient: SQSClient,
    private readonly submitTransactionUseCase: SubmitWagerTransactionUseCase,
  ) {}

  onModuleInit() {
    this.logger.log('Starting SQS Inbox Worker...');
    this.isRunning = true;
    this.poll();
  }

  async onModuleDestroy() {
    this.logger.log('Stopping SQS Inbox Worker (graceful shutdown)...');
    this.isRunning = false;

    // Wait for in-flight messages to complete (max 30s)
    if (this.activeMessages > 0) {
      this.logger.log(`Waiting for ${this.activeMessages} in-flight message(s) to complete...`);
      await Promise.race([
        new Promise<void>((resolve) => { this.shutdownResolve = resolve; }),
        new Promise<void>((resolve) => setTimeout(resolve, 30000)),
      ]);
    }

    this.logger.log('SQS Inbox Worker stopped.');
  }

  private async poll() {
    while (this.isRunning) {
      try {
        const command = new ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 5,
        });

        const response = await this.sqsClient.send(command);

        if (response.Messages && response.Messages.length > 0) {
          for (const msg of response.Messages) {
            await this.processMessage(msg);
          }
        }
      } catch (error) {
        if (!this.isRunning) break; // Don't log errors during shutdown
        this.logger.error('Error receiving messages from SQS', error);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async processMessage(message: any) {
    if (!message.Body || !message.ReceiptHandle) return;

    this.activeMessages++;
    try {
      await RequestContext.create(this.orm.em, async () => {
        const payload = JSON.parse(message.Body);
        const receiveCount = parseInt(message.Attributes?.ApproximateReceiveCount || '1', 10);
        
        this.logger.log({
          msg: 'Processing SQS message',
          messageId: message.MessageId,
          receiveCount,
          type: payload.type,
        });

        // Distinguish error types per README section 10:
        // - Business errors (terminal) → ack
        // - Transient errors → retry with backoff (don't ack)
        // - Permanent errors → DLQ (don't ack, let maxReceiveCount handle it)
        await this.submitTransactionUseCase.execute({
          providerId: payload.data.providerId,
          externalTransactionId: payload.data.externalTransactionId,
          payloadHash: payload.data.idempotencyKey,
          playerId: payload.data.playerId,
          currency: payload.data.money.currency,
          roundId: payload.data.roundId,
          gameId: payload.data.gameId,
          kind: payload.data.kind as WagerTransactionKind,
          moneyAmount: payload.data.money.amount,
          referenceExternalTransactionId: payload.data.referenceExternalTransactionId,
          inbox: {
            messageId: message.MessageId,
            consumerName: this.consumerName,
            payloadHash: payload.data.idempotencyKey,
            receivedAt: new Date(payload.occurredAt || new Date().toISOString()),
          },
        });

        // ACK message ONLY after successful processing and commit
        await this.sqsClient.send(new DeleteMessageCommand({
          QueueUrl: this.queueUrl,
          ReceiptHandle: message.ReceiptHandle,
        }));

        this.logger.log({
          msg: 'Message processed and ACKed',
          messageId: message.MessageId,
        });
      });
    } catch (error: any) {
      if (error.message.includes('InboxMessage collision: message already processed')) {
        // Already processed via Inbox pattern — safe to ACK
        this.logger.warn({
          msg: 'Duplicate message detected (Inbox pattern), ACKing',
          messageId: message.MessageId,
        });
        await this.sqsClient.send(new DeleteMessageCommand({
          QueueUrl: this.queueUrl,
          ReceiptHandle: message.ReceiptHandle,
        }));
      } else if (error.message.includes('Idempotency collision')) {
        // Business error: idempotency conflict — terminal, ACK to prevent retries
        this.logger.warn({
          msg: 'Idempotency collision (terminal business error), ACKing',
          messageId: message.MessageId,
          error: error.message,
        });
        await this.sqsClient.send(new DeleteMessageCommand({
          QueueUrl: this.queueUrl,
          ReceiptHandle: message.ReceiptHandle,
        }));
      } else if (this.isTransientError(error)) {
        // Transient error — increase visibility timeout for backoff, don't ACK
        this.logger.warn({
          msg: 'Transient error, scheduling retry with backoff',
          messageId: message.MessageId,
          error: error.message,
        });
        try {
          await this.sqsClient.send(new ChangeMessageVisibilityCommand({
            QueueUrl: this.queueUrl,
            ReceiptHandle: message.ReceiptHandle,
            VisibilityTimeout: 30, // 30s backoff
          }));
        } catch (_) {
          // Ignore visibility change errors
        }
      } else {
        // Permanent/unknown error — don't ACK, let DLQ handle via maxReceiveCount
        this.logger.error({
          msg: 'Permanent error processing message, will be retried or sent to DLQ',
          messageId: message.MessageId,
          error: error.message,
        });
      }
    } finally {
      this.activeMessages--;
      if (this.activeMessages === 0 && this.shutdownResolve) {
        this.shutdownResolve();
      }
    }
  }

  private isTransientError(error: any): boolean {
    const msg = error.message?.toLowerCase() || '';
    return msg.includes('optimisticlockerror') ||
           msg.includes('connection') ||
           msg.includes('timeout') ||
           msg.includes('econnrefused');
  }
}
