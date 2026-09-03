import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ScheduleModule } from '@nestjs/schedule';
import mikroOrmConfig from './mikro-orm.config.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

// Infra
import { MikroOrmUnitOfWork } from './infrastructure/database/unit-of-work.js';
import { WalletRepository } from './infrastructure/database/repositories/wallet.repository.js';
import { WagerTransactionRepository } from './infrastructure/database/repositories/wager-transaction.repository.js';
import { WalletLedgerRepository } from './infrastructure/database/repositories/wallet-ledger.repository.js';
import { MessagingRepository } from './infrastructure/database/repositories/messaging.repository.js';

import { LoggerModule } from 'nestjs-pino';
import { TerminusModule } from '@nestjs/terminus';

// Application
import { CreateWalletUseCase } from './application/use-cases/create-wallet.usecase.js';
import { SubmitWagerTransactionUseCase } from './application/use-cases/submit-wager-transaction.usecase.js';
import { OutboxWorker } from './application/workers/outbox.worker.js';
import { PendingReferenceWorker } from './application/workers/pending-reference.worker.js';

// Presentation
import { WalletController } from './presentation/http/wallet.controller.js';
import { TransactionController } from './presentation/http/transaction.controller.js';
import { ReconciliationController } from './presentation/http/reconciliation.controller.js';
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
  controllers: [AppController, WalletController, TransactionController, ReconciliationController, HealthController],
  providers: [
    AppService,
    WalletRepository,
    WagerTransactionRepository,
    WalletLedgerRepository,
    MessagingRepository,
    { provide: 'IUnitOfWork', useClass: MikroOrmUnitOfWork },
    MikroOrmUnitOfWork,

    {
      provide: 'IEventPublisher',
      useValue: {
        publish: async (url: string, event: any) => console.log(`Mock published to ${url}`, event)
      }
    },

    CreateWalletUseCase,
    SubmitWagerTransactionUseCase,

    OutboxWorker,
    PendingReferenceWorker,

    SqsConsumer,
  ],
})
export class AppModule {}
