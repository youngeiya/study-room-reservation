import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// 앱의 시작점 (Spring의 main() + SpringApplication.run 에 해당)
async function bootstrap() {
  // AppModule에 등록된 모듈·Provider를 모아 의존성 주입 컨테이너를 만든다.
  const app = await NestFactory.create(AppModule);

  // 모든 경로 앞에 /api 를 붙인다. (예: @Controller('students') → /api/students)
  app.setGlobalPrefix('api');

  // 모든 요청 body를 DTO의 class-validator 규칙으로 검사한다 (Spring의 @Valid 와 비슷).
  app.useGlobalPipes(
    new ValidationPipe({
      // DTO에 정의되지 않은 필드는 제거하고,
      whitelist: true,
      // 정의되지 않은 필드가 오면 아예 에러로 거부한다 (오타·불필요한 필드 방지).
      forbidNonWhitelisted: true,
      // 요청 JSON을 DTO 클래스 인스턴스로 변환한다.
      transform: true,
    }),
  );

  // 포트는 환경변수 PORT 가 있으면 그 값, 없으면 3000
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();