import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { Clock } from './clock.service';
import { ResponseInterceptor } from './response.interceptor';

// @Global: 다른 모듈이 import 하지 않아도 exports 한 Provider(Clock)를 주입받을 수 있다.
@Global()
@Module({
  providers: [
    Clock,
    // APP_FILTER / APP_INTERCEPTOR 는 "앱 전체에 적용"을 뜻하는 NestJS 전용 토큰이다.
    // main.ts 에서 new 로 직접 등록하지 않고 여기서 등록하는 이유:
    // Nest 가 만든 객체여야 생성자 주입(DI)을 쓸 수 있기 때문이다.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
  exports: [Clock],
})
export class CommonModule {}
