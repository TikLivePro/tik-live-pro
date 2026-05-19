import pino from 'pino';

export interface LogContext {
  correlationId?: string;
  traceId?: string;
  userId?: string;
  sessionId?: string;
  service?: string;
  [key: string]: unknown;
}

export type Logger = pino.Logger;

export function createLogger(serviceName: string, options: { level?: string } = {}): Logger {
  return pino({
    level: options.level ?? process.env['LOG_LEVEL'] ?? 'info',
    base: { service: serviceName },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  });
}

export function withContext(logger: Logger, ctx: LogContext): Logger {
  return logger.child(ctx);
}
