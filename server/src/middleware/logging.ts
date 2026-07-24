import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import logger from '../logger';

const log = logger.child({ module: 'http' });

export interface LoggedRequest extends Request {
  id: string;
  startTime: number;
}

export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction) {
  (req as LoggedRequest).id = req.headers['x-request-id'] as string || crypto.randomUUID();
  (req as LoggedRequest).startTime = Date.now();
  next();
}

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const reqId = (req as LoggedRequest).id;
  const start = (req as LoggedRequest).startTime;

  log.info(`${req.method} ${req.path}`, {
    requestId: reqId,
    ip: req.ip,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
  });

  const originalEnd = res.end;
  res.end = function (this: Response, ...args: any[]) {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'http';
    log[level](`${req.method} ${req.path} → ${res.statusCode}`, {
      requestId: reqId,
      duration,
      status: res.statusCode,
    });
    return originalEnd.apply(this, args as any);
  } as any;

  next();
}

export function errorMiddleware(err: Error, req: Request, _res: Response, next: NextFunction) {
  const reqId = (req as LoggedRequest)?.id || 'unknown';
  log.error(`Unhandled error in ${req.method} ${req.path}`, {
    requestId: reqId,
    error: err.message,
    stack: err.stack,
  });
  next(err);
}
