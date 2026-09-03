import { Options, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';

import { WalletSchema } from './infrastructure/database/entities/wallet.entity.js';
import { WagerTransactionSchema } from './infrastructure/database/entities/wager-transaction.entity.js';
import { WalletLedgerSchema } from './infrastructure/database/entities/wallet-ledger.entity.js';
import { InboxMessageSchema } from './infrastructure/database/entities/inbox-message.entity.js';
import { OutboxMessageSchema } from './infrastructure/database/entities/outbox-message.entity.js';

const config: Options = {
  driver: PostgreSqlDriver,
  dbName: process.env.DB_NAME || 'wagering',
  user: process.env.DB_USER || 'jungle',
  password: process.env.DB_PASSWORD || 'password',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  entities: [WalletSchema, WagerTransactionSchema, WalletLedgerSchema, InboxMessageSchema, OutboxMessageSchema],
  extensions: [Migrator],
  migrations: {
    path: './dist/migrations',
    pathTs: './src/migrations',
    disableForeignKeys: false,
  },
  debug: process.env.NODE_ENV !== 'production',
};

export default config;
