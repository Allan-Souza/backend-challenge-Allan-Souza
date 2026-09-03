import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
    } else if (exception instanceof Error) {
      message = exception.message;
      if (message.includes('Idempotency collision') || message.includes('already exists')) {
        status = HttpStatus.CONFLICT;
      } else if (message.includes('not found')) {
        status = HttpStatus.NOT_FOUND;
      } else if (message.includes('Insufficient funds')) {
        status = HttpStatus.PAYMENT_REQUIRED;
      }
    }

    response.status(status).json({
      statusCode: status,
      message,
    });
  }
}
