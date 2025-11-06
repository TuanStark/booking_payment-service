import { Injectable, LoggerService, Scope } from '@nestjs/common';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger implements LoggerService {
    private readonly logger: winston.Logger;
    private context?: string;

    constructor() {
        const logFormat = winston.format.printf(
            ({ timestamp, level, message }) => {
                return `${timestamp} [${level}]${
                    this.context ? ' [' + this.context + ']' : ''
                }: ${message}`;
            },
        );

        const transports: any[] = [
            new winston.transports.Console(),
            new winston.transports.DailyRotateFile({
                filename: 'logs/application-%DATE%.log',
                datePattern: 'YYYY-MM-DD',
                zippedArchive: true,
                maxSize: '20m',
                maxFiles: '14d',
            }),
        ];

        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss',
                }),
                logFormat,
            ),
            transports: transports,
        });
    }

    setContext(context: string) {
        this.context = context;
    }

    log(message: string) {
        this.logger.info(message);
    }

    error(...message: any[]) {
        this.logger.error(message);
    }

    warn(message: string) {
        this.logger.warn(message);
    }

    debug(message: string) {
        this.logger.debug(message);
    }

    verbose(message: string) {
        this.logger.verbose(message);
    }
}
