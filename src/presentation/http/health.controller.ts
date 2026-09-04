import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, MikroOrmHealthIndicator, HealthCheckResult } from '@nestjs/terminus';
import { SQSClient, GetQueueUrlCommand } from '@aws-sdk/client-sqs';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: MikroOrmHealthIndicator,
    private sqsClient: SQSClient,
  ) {}

  @Get('liveness')
  @HealthCheck()
  checkLiveness() {
    return { status: 'up' };
  }

  @Get('readiness')
  @HealthCheck()
  checkReadiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck('database'),
      async () => {
        try {
          await this.sqsClient.send(new GetQueueUrlCommand({ QueueName: 'wager-transactions.fifo' }));
          return { sqs: { status: 'up' } };
        } catch (error) {
          return { sqs: { status: 'down', message: 'SQS unreachable' } };
        }
      },
    ]);
  }
}
