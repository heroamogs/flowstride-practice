import type { IncomingMessage } from 'node:http';

export class InputError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function readForm(req: IncomingMessage): Promise<Record<string, unknown>> {
  const type = req.headers['content-type']?.split(';', 1)[0];
  const limit = 16 * 1024;
  if (type !== 'application/json' && type !== 'application/x-www-form-urlencoded') {
    throw new InputError(415, 'Use JSON or a form to submit these fields.');
  }
  if (Number(req.headers['content-length']) > limit) throw new InputError(413, 'The submission is too large.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += data.length;
    if (size > limit) throw new InputError(413, 'The submission is too large.');
    chunks.push(data);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (type === 'application/x-www-form-urlencoded') return Object.fromEntries(new URLSearchParams(raw));
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError(400, 'Expected a JSON object.');
  return value as Record<string, unknown>;
}

export const field = (body: Record<string, unknown>, name: string) => typeof body[name] === 'string' ? body[name] : '';
