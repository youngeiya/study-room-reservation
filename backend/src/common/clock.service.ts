import { Injectable } from '@nestjs/common';

/** 현재 시각 공급자. 서비스가 new Date()를 직접 부르지 않게 해 테스트에서 시각을 고정할 수 있다. */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
