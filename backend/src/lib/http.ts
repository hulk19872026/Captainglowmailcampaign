import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { DbUnavailableError } from './db';
import { log } from './log';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const bad = (msg: string) => new HttpError(400, msg);
export const notFound = (what = 'That item') => new HttpError(404, `${what} could not be found. It may have been deleted.`);

/** Wraps async route handlers so errors reach the error handler. */
export function ah(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { fn(req, res, next).catch(next); };
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof DbUnavailableError) {
    return res.status(503).json({ error: err.message, database: 'down' });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large.' });
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'That file is too large (max 10 MB).' });
  log.error('http', `${req.method} ${req.path} failed`, err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again, and check the server log if it keeps happening.' });
}

export function intParam(v: unknown, name = 'id'): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw bad(`Invalid ${name}.`);
  return n;
}
