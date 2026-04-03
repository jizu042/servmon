import type { Response } from "express";

export type ApiEnvelope<T> =
  | { success: true; data: T; error: null; meta?: Record<string, unknown> | null }
  | {
      success: false;
      data: null;
      error: { code: string; message: string; details?: unknown };
      meta?: null;
    };

export function sendOk<T>(res: Response, status: number, data: T, meta?: Record<string, unknown> | null) {
  const envelope: ApiEnvelope<T> = { success: true, data, error: null, meta: meta ?? null };
  res.status(status).json(envelope);
}

export function sendErr(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown
) {
  const envelope: ApiEnvelope<null> = {
    success: false,
    data: null,
    error: {
      code,
      message,
      details: process.env.NODE_ENV === "production" ? undefined : details
    },
    meta: null
  };
  res.status(status).json(envelope);
}
