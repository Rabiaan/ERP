import { config, type LogLevel } from '../config';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEY =
  /(password|passwd|secret|token|authorization|cookie|mfa|otp|recovery|phone|dsn|connection|database_url|kms|private_?key|api_?key|app_?secret)/i;

const REDACTED = '[REDACTED]';
const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_LENGTH = 50;
const MAX_DEPTH = 6;

function redactString(value: string): string {
  const redacted = value
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, '[REDACTED_DSN]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(
      /\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g,
      '$1***@$2',
    )
    .replace(/\b(password|secret|token)=([^\s&]+)/gi, '$1=[REDACTED]');

  return redacted.length > MAX_STRING_LENGTH
    ? `${redacted.slice(0, MAX_STRING_LENGTH)}...`
    : redacted;
}

export function sanitizeForLog(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    return '[UNSERIALIZABLE]';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    const code = (value as { code?: unknown }).code;
    return {
      name: value.name,
      message: redactString(value.message),
      code: typeof code === 'string' ? code : undefined,
    };
  }

  if (depth >= MAX_DEPTH) {
    return '[MAX_DEPTH]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeForLog(item, depth + 1, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[CIRCULAR]';
    }
    seen.add(value);

    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY.test(key)
        ? REDACTED
        : sanitizeForLog(item, depth + 1, seen);
    }
    return output;
  }

  return '[UNSERIALIZABLE]';
}

export type LogBindings = Record<string, unknown>;

export type Logger = {
  debug(event: string, data?: unknown): void;
  info(event: string, data?: unknown): void;
  warn(event: string, data?: unknown): void;
  error(event: string, data?: unknown): void;
  child(bindings: LogBindings): Logger;
};

function isEnabled(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[config.logLevel];
}

function createLogger(bindings: LogBindings): Logger {
  const emit = (level: LogLevel, event: string, data?: unknown): void => {
    if (!isEnabled(level)) {
      return;
    }

    const sanitizedBindings = sanitizeForLog(bindings) as Record<string, unknown>;
    const entry: Record<string, unknown> = {
      time: new Date().toISOString(),
      level,
      event,
      ...sanitizedBindings,
    };

    if (data !== undefined) {
      entry.data = sanitizeForLog(data);
    }

    const line = JSON.stringify(entry);
    if (level === 'error' || level === 'warn') {
      console.error(line);
    } else {
      console.log(line);
    }
  };

  return {
    debug: (event, data) => emit('debug', event, data),
    info: (event, data) => emit('info', event, data),
    warn: (event, data) => emit('warn', event, data),
    error: (event, data) => emit('error', event, data),
    child: (extra) => createLogger({ ...bindings, ...extra }),
  };
}

export const logger: Logger = createLogger({ service: 'lilac-office' });
