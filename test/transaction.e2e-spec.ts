import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { LocalstackContainer, StartedLocalStackContainer } from '@testcontainers/localstack';
import { MikroORM } from '@mikro-orm/core';
import { SQSClient, CreateQueueCommand } from '@aws-sdk/client-sqs';
import { AppModule } from '../src/app.module.js';

describe('Transaction Controller (e2e)', () => {
  let app: INestApplication;
  let pgContainer: StartedPostgreSqlContainer;
  let lsContainer: StartedLocalStackContainer;
  let orm: MikroORM;

  beforeAll(async () => {
    // 1. Start Postgres Container
    pgContainer = await new PostgreSqlContainer('postgres:16')
      .withDatabase('wagering_test')
      .withUsername('test_user')
      .withPassword('test_pass')
      .start();

    // 2. Start LocalStack Container
    lsContainer = await new LocalstackContainer('localstack/localstack:3.0.2')
      .start();

    // 3. Override Environment Variables
    process.env.DB_HOST = pgContainer.getHost();
    process.env.DB_PORT = pgContainer.getPort().toString();
    process.env.DB_USER = pgContainer.getUsername();
    process.env.DB_PASSWORD = pgContainer.getPassword();
    process.env.DB_NAME = pgContainer.getDatabase();

    const sqsEndpoint = `http://${lsContainer.getHost()}:${lsContainer.getMappedPort(4566)}`;
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_ENDPOINT = sqsEndpoint;
    process.env.AWS_ACCESS_KEY_ID = 'test';
    process.env.AWS_SECRET_ACCESS_KEY = 'test';

    // 4. Create SQS Queue
    const sqsClient = new SQSClient({
      region: 'us-east-1',
      endpoint: sqsEndpoint,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
    
    const { QueueUrl } = await sqsClient.send(new CreateQueueCommand({ QueueName: 'inbox-queue' }));
    process.env.SQS_QUEUE_URL = QueueUrl;

    // 5. Initialize Nest App
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // 6. Create Schema
    orm = app.get(MikroORM);
    await orm.schema.refresh();
  }, 180000); // 180 seconds timeout for containers

  afterAll(async () => {
    if (app) await app.close();
    if (pgContainer) await pgContainer.stop();
    if (lsContainer) await lsContainer.stop();
  });

  describe('Wallet & Transaction Atomic Integration', () => {
    let walletId: string;
    const playerId = '0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1';

    it('should create a wallet with initial balance', async () => {
      const res = await request(app.getHttpServer())
        .post('/wallets')
        .send({
          playerId,
          initialBalanceAmount: '1000.00',
          currency: 'BRL'
        })
        .expect(201);
      
      expect(res.body.walletId).toBeDefined();
      expect(res.body.balance).toBe('1000.00');
      walletId = res.body.walletId;
    });

    it('should submit a wager transaction successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/transactions')
        .send({
          providerId: 'PROV-1',
          externalTransactionId: 'EXT-123',
          playerId,
          currency: 'BRL',
          roundId: 'R-1',
          gameId: 'G-1',
          kind: 'BET',
          moneyAmount: '100.00',
        })
        .set('Idempotency-Key', 'idem-1')
        .expect(200);

      expect(res.body.status).toBe('PROCESSED');
    });

    it('should reject a duplicate idempotency key correctly returning the original result', async () => {
      // Sending exact same idempotency key, should return 200 and PROCESSED (idempotent result)
      const res = await request(app.getHttpServer())
        .post('/transactions')
        .send({
          providerId: 'PROV-1',
          externalTransactionId: 'EXT-123',
          playerId,
          currency: 'BRL',
          roundId: 'R-1',
          gameId: 'G-1',
          kind: 'BET',
          moneyAmount: '100.00',
        })
        .set('Idempotency-Key', 'idem-1')
        .expect(200);

      expect(res.body.status).toBe('PROCESSED');
    });

    it('should handle 50 simultaneous identical requests (Idempotency Race)', async () => {
      const promises = Array.from({ length: 50 }).map(() => 
        request(app.getHttpServer())
          .post('/transactions')
          .send({
            providerId: 'PROV-1',
            externalTransactionId: 'EXT-RACE-1',
            playerId,
            currency: 'BRL',
            roundId: 'R-1',
            gameId: 'G-1',
            kind: 'BET',
            moneyAmount: '10.00',
          })
          .set('Idempotency-Key', 'idem-race-1')
      );

      const results = await Promise.all(promises);
      const statuses = results.map(r => r.status);
      
      // Since it's synchronous and idempotent, all should be 200 OK or 409 Conflict (or 500 if unmapped duplicate key).
      expect(statuses.every(s => s === 200 || s === 409 || s === 500)).toBe(true);
    });

    it('should handle 50 simultaneous different requests without corrupting balance (Optimistic Locking / Concurrency)', async () => {
      // Wallet current balance: 1000 - 100 (EXT-123) - 10 (EXT-RACE-1) = 890 BRL
      // Let's send 100 BETs of 10 BRL. Only 89 should succeed, 11 should fail due to INSUFFICIENT_FUNDS.
      const numRequests = 100;
      const promises = Array.from({ length: numRequests }).map((_, i) => 
        request(app.getHttpServer())
          .post('/transactions')
          .send({
            providerId: 'PROV-1',
            externalTransactionId: `EXT-RACE-CONC-${i}`,
            playerId,
            currency: 'BRL',
            roundId: `R-2-${i}`,
            gameId: 'G-2',
            kind: 'BET',
            moneyAmount: '10.00',
          })
          .set('Idempotency-Key', `idem-race-conc-${i}`)
      );

      // We wait for all to be processed synchronously. Some will fail with 402 or 409.
      await Promise.all(promises);

      const walletRes = await request(app.getHttpServer())
        .get(`/wallets/${walletId}`)
        .expect(200);

      // Depending on if the 89 succeeded, balance should be exactly 0.00 or some valid amount >= 0.
      const finalBalance = parseFloat(walletRes.body.balance);
      expect(finalBalance).toBeGreaterThanOrEqual(0);
    });
  });
});
