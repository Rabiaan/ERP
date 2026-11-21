import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { config } from '../config';
import { AppError } from '../http/errors';

export type UploadKind = 'png' | 'jpeg' | 'webp' | 'pdf';

export type UploadInput = {
  buffer: Buffer;
  originalName?: string;
  mimeType?: string;
};

export type UploadResult = {
  id: string;
  fileName: string;
  relativePath: string;
  mimeType: string;
  bytes: number;
  sha256: string;
};

export type MalwareScanHook = (buffer: Buffer) => Promise<boolean>;

const MAX_IMAGE_PIXELS = 25_000_000;

const FILE_TYPES: Record<UploadKind, { extension: string; mimeType: string }> = {
  png: { extension: 'png', mimeType: 'image/png' },
  jpeg: { extension: 'jpg', mimeType: 'image/jpeg' },
  webp: { extension: 'webp', mimeType: 'image/webp' },
  pdf: { extension: 'pdf', mimeType: 'application/pdf' },
};

let malwareScanHook: MalwareScanHook | undefined;

export function setMalwareScanHook(hook: MalwareScanHook | undefined): void {
  malwareScanHook = hook;
}

export function detectUploadKind(buffer: Buffer): UploadKind | null {
  if (buffer.length >= 8) {
    const png = buffer.subarray(0, 8);
    if (png.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return 'png';
    }
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }

  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'pdf';
  }

  return null;
}

async function sanitizeImage(buffer: Buffer, kind: Exclude<UploadKind, 'pdf'>): Promise<Buffer> {
  try {
    const image = sharp(buffer, {
      limitInputPixels: MAX_IMAGE_PIXELS,
      failOn: 'error',
    }).rotate();

    if (kind === 'png') {
      return await image.png({ compressionLevel: 9 }).toBuffer();
    }
    if (kind === 'jpeg') {
      return await image.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    }
    return await image.webp({ quality: 90 }).toBuffer();
  } catch {
    throw new AppError('VALIDATION_ERROR', 'The uploaded image is not valid.');
  }
}

export async function saveUpload(
  input: UploadInput,
  options?: { directory?: string; maxBytes?: number },
): Promise<UploadResult> {
  const maxBytes = options?.maxBytes ?? config.uploadMaxBytes;

  if (input.buffer.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'The uploaded file is empty.');
  }

  if (input.buffer.length > maxBytes) {
    throw new AppError('PAYLOAD_TOO_LARGE', 'The uploaded file exceeds the size limit.');
  }

  const kind = detectUploadKind(input.buffer);
  if (!kind) {
    throw new AppError('VALIDATION_ERROR', 'Only PNG, JPEG, WebP, and PDF files are allowed.');
  }

  if (malwareScanHook && (await malwareScanHook(input.buffer))) {
    throw new AppError('VALIDATION_ERROR', 'The uploaded file did not pass the security scan.');
  }

  const output =
    kind === 'pdf' ? input.buffer : await sanitizeImage(input.buffer, kind as Exclude<UploadKind, 'pdf'>);
  const type = FILE_TYPES[kind];
  const id = randomUUID();
  const fileName = `${id}.${type.extension}`;
  const directory = resolve(options?.directory ?? config.uploadDir);

  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, fileName), output, { flag: 'wx', mode: 0o600 });

  return {
    id,
    fileName,
    relativePath: `${directory}/${fileName}`,
    mimeType: type.mimeType,
    bytes: output.length,
    sha256: createHash('sha256').update(output).digest('hex'),
  };
}
