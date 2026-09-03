import { Options, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';

const config: Options = {
  driver: PostgreSqlDriver,
  dbName: process.env.DB_NAME || 'wagering',
  user: process.env.DB_USER || 'jungle',
  password: process.env.DB_PASSWORD || 'password',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  entities: ['./dist/**/*.entity.js', './dist/**/*.event.js'],
  entitiesTs: ['./src/**/*.entity.ts', './src/**/*.event.ts'],
  extensions: [Migrator],
  migrations: {
    path: './dist/migrations',
    pathTs: './src/migrations',
    disableForeignKeys: false,
  },
  debug: process.env.NODE_ENV !== 'production',
};

export default config;
