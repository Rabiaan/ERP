import { AppError } from '../http/errors';

export type AuditJson =
  | null
  | boolean
  | number
  | string
  | AuditJson[]
  | { [key: string]: AuditJson };

const SENSITIVE_KEY =
  /password|secret|token|authorization|cookie|credential|csrf|private.?key|kms.?key|connection.?string|database.?url|phone|mobile|cnic|national.?id|bank.?account/i;
const MAX_DEPTH = 12;
const MAX_COLLECTION_SIZE = 500;
const MAX_STRING_LENGTH = 10_000;

function sanitize(value: unknown, ancestors: Set<object>, depth: number): AuditJson {
  if (depth > MAX_DEPTH) {
    throw new AppError('VALIDATION_ERROR', 'Audit snapshot exceeds the maximum nesting depth.');
  }
  if (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (typeof value === 'number') {
    throw new AppError('VALIDATION_ERROR', 'Audit snapshot contains a non-finite number.');
  }
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) {
      throw new AppError('VALIDATION_ERROR', 'Audit snapshot contains an oversized string.');
    }
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new AppError('VALIDATION_ERROR', 'Audit snapshot contains an invalid date.');
    }
    return value.toISOString();
  }
  if (Buffer.isBuffer(value)) {
    return '[binary omitted]';
  }
  if (typeof value !== 'object' || value === undefined) {
    throw new AppError('VALIDATION_ERROR', 'Audit snapshot contains an unsupported value.');
  }
  if (ancestors.has(value)) {
    throw new AppError('VALIDATION_ERROR', 'Audit snapshot contains a circular reference.');
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_COLLECTION_SIZE) {
        throw new AppError('VALIDATION_ERROR', 'Audit snapshot contains an oversized array.');
      }
      return value.map((item) => sanitize(item, ancestors, depth + 1));
    }

    const entries = Object.entries(value);
    if (entries.length > MAX_COLLECTION_SIZE) {
      throw new AppError('VALIDATION_ERROR', 'Audit snapshot contains too many fields.');
    }

    const result: { [key: string]: AuditJson } = {};
    for (const [key, item] of entries) {
      if (!SENSITIVE_KEY.test(key)) {
        result[key] = sanitize(item, ancestors, depth + 1);
      }
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

export function sanitizeAuditValue(value: unknown): AuditJson | null {
  if (value === undefined) {
    return null;
  }
  return sanitize(value, new Set(), 0);
}
