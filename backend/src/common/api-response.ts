/** 모든 응답의 공통 형태. 성공은 code = 'OK'. */
export interface ApiResponse<T = unknown> {
  code: string;
  message: string;
  data: T;
}
