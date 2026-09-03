import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, MikroOrmHealthIndicator } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: MikroOrmHealthIndicator,
  ) {}

  @Get('liveness')
  @HealthCheck()
  checkLiveness() {
    return { status: 'up' };
  }

  @Get('readiness')
  @HealthCheck()
  checkReadiness() {
    return this.health.check([
      () => this.db.pingCheck('database'),
    ]);
  }
}
