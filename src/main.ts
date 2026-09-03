import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './presentation/http/global-exception.filter.js';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
