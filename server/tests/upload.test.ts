import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { AppError } from '../src/http/errors';
import { saveUpload } from '../src/security/upload';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('upload rejects a fake image and strips metadata from a valid image', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lilac-upload-'));

  try {
    await assert.rejects(
      () =>
        saveUpload(
          { buffer: Buffer.concat([PNG_MAGIC, Buffer.from('this is not a png')]) },
          { directory },
        ),
      (error: unknown) => error instanceof AppError && error.code === 'VALIDATION_ERROR',
    );

    const valid = await sharp({
      create: {
        width: 48,
        height: 32,
        channels: 3,
        background: { r: 120, g: 80, b: 160 },
      },
    })
      .withMetadata({ exif: { IFD0: { ImageDescription: 'must be removed' } } })
      .png()
      .toBuffer();

    const saved = await saveUpload({ buffer: valid, originalName: '../../../escape.png' }, { directory });
    const stored = await readFile(join(directory, saved.fileName));
    const metadata = await sharp(stored).metadata();

    assert.equal(saved.mimeType, 'image/png');
    assert.equal(saved.fileName, `${saved.id}.png`);
    assert.equal(metadata.exif, undefined);

    await assert.rejects(
      () => saveUpload({ buffer: valid }, { directory, maxBytes: 32 }),
      (error: unknown) => error instanceof AppError && error.code === 'PAYLOAD_TOO_LARGE',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
