import { Module, Global } from '@nestjs/common';
import { SQSClient } from '@aws-sdk/client-sqs';

import { InboxWorkerService } from './inbox.worker.js';
import { OutboxWorkerService } from './outbox.worker.js';

@Global()
@Module({
  providers: [
    InboxWorkerService,
    OutboxWorkerService,
    {
      provide: SQSClient,
      useFactory: () => {
        return new SQSClient({
          region: process.env.AWS_REGION || 'us-east-1',
          endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
          },
        });
      },
    },
  ],
  exports: [SQSClient, InboxWorkerService, OutboxWorkerService],
})
export class MessagingModule {}
