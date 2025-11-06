import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { tap } from 'rxjs/operators';
import { AppLogger } from './logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    constructor(private readonly logger: AppLogger) {}

    intercept(context: ExecutionContext, next: CallHandler): any {
        const now = Date.now();
        const req = context.switchToHttp().getRequest();
        const { method, url } = req;

        return next
            .handle()
            .pipe(
                tap(() =>
                    this.logger.log(`${method} ${url} ${Date.now() - now}ms`),
                ),
            );
    }
}
