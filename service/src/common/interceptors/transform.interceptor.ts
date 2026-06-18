import { Result } from '@/common/result';
import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { catchError, throwError } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): any {
    return next.handle().pipe(
      map(data => {
        const response = context.switchToHttp().getResponse();
        const request = context.switchToHttp().getRequest();
        response.statusCode = 200;
        /* 微信类支付类通知接口需要原样输出 */
        if (request.path.includes('notify')) {
          return data;
        }
        /* 二进制流（如图片代理下载）不能包进 JSON，否则前端会存到损坏的“假图片” */
        if (data instanceof StreamableFile) {
          return data;
        }
        const message = response.status < 400 ? null : response.statusText;
        return Result.success(data, message);
      }),
      catchError(error => {
        const statusCode = error.status || error.statusCode || 500;
        const raw = error?.response;
        let message = 'Internal server error';
        if (typeof raw === 'string') message = raw;
        else if (raw && typeof raw === 'object') {
          const m = (raw as { message?: string | string[] }).message;
          message = Array.isArray(m) ? m[0] : m || error?.message || message;
        } else if (error?.message) {
          message = String(error.message);
        }
        return throwError(new HttpException(message, statusCode));
      }),
    );
  }
}
