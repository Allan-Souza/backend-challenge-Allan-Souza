import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ScheduleModule } from '@nestjs/schedule';
import mikroOrmConfig from './mikro-orm.config.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { SQSClient } from '@aws-sdk/client-sqs';

// Infra
import { MikroOrmUnitOfWork } from './infrastructure/database/unit-of-work.js';
import { WalletRepository } from './infrastructure/database/repositories/wallet.repository.js';
import { WagerTransactionRepository } from './infrastructure/database/repositories/wager-transaction.repository.js';
import { WalletLedgerRepository } from './infrastructure/database/repositories/wallet-ledger.repository.js';
import { MessagingRepository } from './infrastructure/database/repositories/messaging.repository.js';
import { InboxWorkerService } from './infrastructure/messaging/inbox.worker.js';
import { OutboxWorkerService } from './infrastructure/messaging/outbox.worker.js';

import { LoggerModule } from 'nestjs-pino';
import { TerminusModule } from '@nestjs/terminus';

// Application
import { CreateWalletUseCase } from './application/use-cases/create-wallet.usecase.js';
import { SubmitWagerTransactionUseCase } from './application/use-cases/submit-wager-transaction.usecase.js';
import { PendingReferenceWorker } from './application/workers/pending-reference.worker.js';

// Presentation
import { WalletController } from './presentation/http/wallet.controller.js';
import { TransactionController } from './presentation/http/transaction.controller.js';
import { ProviderTransactionController } from './presentation/http/provider-transaction.controller.js';
import { HealthController } from './presentation/http/health.controller.js';
import { SqsConsumer } from './presentation/messaging/sqs.consumer.js';

@Module({
  imports: [
    MikroOrmModule.forRoot(mikroOrmConfig),
    ScheduleModule.forRoot(),
    TerminusModule,
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
        autoLogging: false,
        serializers: {
          req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url,
            correlationId: req.headers['x-correlation-id'],
          }),
        },
      },
    }),
  ],
  controllers: [AppController, WalletController, TransactionController, ProviderTransactionController, HealthController],
  providers: [
    AppService,
    WalletRepository,
    WagerTransactionRepository,
    WalletLedgerRepository,
    MessagingRepository,
    { provide: 'IUnitOfWork', useClass: MikroOrmUnitOfWork },
    MikroOrmUnitOfWork,

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

    {
      provide: 'IEventPublisher',
      useValue: {
        publish: async (url: string, event: any) => console.log(`Mock published to ${url}`, event)
      }
    },

    CreateWalletUseCase,
    SubmitWagerTransactionUseCase,

    InboxWorkerService,
    OutboxWorkerService,
    PendingReferenceWorker,

    SqsConsumer,
  ],
})
export class AppModule {}
