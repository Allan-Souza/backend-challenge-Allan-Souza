import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { SubmitWagerTransactionUseCase } from '../../application/use-cases/submit-wager-transaction.usecase.js';
import { WagerTransactionKind } from '../../domain/wager-transaction.js';

@Injectable()
export class InboxWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InboxWorkerService.name);
  private isRunning = false;
  private readonly queueUrl = 'http://localhost:4566/000000000000/wager-transactions.fifo';
  private readonly consumerName = 'inbox-worker-1';

  constructor(
    private readonly sqsClient: SQSClient,
    private readonly submitTransactionUseCase: SubmitWagerTransactionUseCase,
  ) {}

  onModuleInit() {
    this.logger.log('Starting SQS Inbox Worker...');
    this.isRunning = true;
    this.poll();
  }

  onModuleDestroy() {
    this.logger.log('Stopping SQS Inbox Worker...');
    this.isRunning = false;
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
          await Promise.all(response.Messages.map((msg) => this.processMessage(msg)));
        }
      } catch (error) {
        this.logger.error('Error receiving messages from SQS', error);
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Sleep before retry
      }
    }
  }

  private async processMessage(message: any) {
    if (!message.Body || !message.ReceiptHandle) return;

    try {
      const payload = JSON.parse(message.Body);
      
      this.logger.log(`Processing message ${message.MessageId} from SQS`);

      // Using the exact format specified in README
      await this.submitTransactionUseCase.execute({
        providerId: payload.data.providerId,
        externalTransactionId: payload.data.externalTransactionId,
        payloadHash: payload.data.idempotencyKey, // Mock hash logic using key
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
          payloadHash: payload.data.idempotencyKey, // Simplification
          receivedAt: new Date(payload.occurredAt || new Date().toISOString()),
        },
      });

      // Ack message ONLY after successful processing and commit
      await this.sqsClient.send(new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      }));
      this.logger.log(`Successfully processed and ACKed message ${message.MessageId}`);

    } catch (error: any) {
      if (error.message.includes('InboxMessage collision: message already processed')) {
        this.logger.warn(`Message ${message.MessageId} was already processed (Inbox pattern). ACKing...`);
        await this.sqsClient.send(new DeleteMessageCommand({
          QueueUrl: this.queueUrl,
          ReceiptHandle: message.ReceiptHandle,
        }));
      } else {
        this.logger.error(`Failed to process message ${message.MessageId}: ${error.message}`);
        // Do not ACK. Will be picked up again or moved to DLQ based on maxReceiveCount in SQS config
      }
    }
  }
}
