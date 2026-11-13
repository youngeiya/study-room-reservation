import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { Clock } from './clock.service';
import { ResponseInterceptor } from './response.interceptor';

@Global()
@Module({
  providers: [
    Clock,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
  exports: [Clock],
})
export class CommonModule {}
