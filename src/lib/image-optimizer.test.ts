import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  isHeicFile,
  hasHeicSignature,
  optimizeImage,
  ImageProcessingError,
  UnsupportedFormatError,
} from './image-optimizer';

// 64x48 solid-red HEVC-coded HEIC, the format iPhones save photos in
const sampleHeic = readFileSync(new URL('./__fixtures__/sample.heic', import.meta.url));

function makeImageBuffer(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 80, b: 40 } },
  })
    .png()
    .toBuffer();
}

describe('isHeicFile', () => {
  it('detects .heic and .heif extensions case-insensitively', () => {
    expect(isHeicFile('photo.HEIC')).toBe(true);
    expect(isHeicFile('photo.heif')).toBe(true);
  });

  it('detects heic/heif mime types', () => {
    expect(isHeicFile('photo.jpg', 'image/heic')).toBe(true);
    expect(isHeicFile('photo.jpg', 'image/heif')).toBe(true);
  });

  it('returns false for ordinary image files', () => {
    expect(isHeicFile('photo.jpg', 'image/jpeg')).toBe(false);
    expect(isHeicFile('photo.png')).toBe(false);
  });
});

describe('hasHeicSignature', () => {
  it('detects a HEIC file from its header bytes', () => {
    expect(hasHeicSignature(sampleHeic)).toBe(true);
  });

  it('detects a HEIC file whose major brand is generic mif1 but lists heic as compatible', () => {
    // The fixture's ftyp box is: major 'heic', compatible ['mif1', 'heic', 'miaf']
    const mif1Major = Buffer.from(sampleHeic);
    mif1Major.write('mif1', 8, 'ascii');
    expect(hasHeicSignature(mif1Major)).toBe(true);
  });

  it('does not treat an AVIF file as HEIC', () => {
    const avif = Buffer.alloc(32);
    avif.writeUInt32BE(28, 0);
    avif.write('ftypavif', 4, 'ascii');
    avif.write('avifmif1miaf', 16, 'ascii');
    expect(hasHeicSignature(avif)).toBe(false);
  });

  it('returns false for non-HEIC images and short buffers', async () => {
    expect(hasHeicSignature(await makeImageBuffer(10, 10))).toBe(false);
    expect(hasHeicSignature(Buffer.from('tiny'))).toBe(false);
  });
});

describe('optimizeImage', () => {
  it('does not resize an image already under the max dimensions', async () => {
    const input = await makeImageBuffer(200, 150);
    const result = await optimizeImage(input, { maxWidth: 1920, maxHeight: 1920, format: 'webp' });
    expect(result.width).toBe(200);
    expect(result.height).toBe(150);
    expect(result.format).toBe('webp');
  });

  it('resizes an image that exceeds maxWidth while preserving aspect ratio', async () => {
    const input = await makeImageBuffer(4000, 2000);
    const result = await optimizeImage(input, { maxWidth: 1920, maxHeight: 1920, format: 'webp' });
    expect(result.width).toBeLessThanOrEqual(1920);
    expect(result.height).toBeLessThanOrEqual(1920);
    // aspect ratio (2:1) preserved
    expect(Math.round(result.width / result.height)).toBe(2);
  });

  it('converts to the requested format', async () => {
    const input = await makeImageBuffer(100, 100);
    const jpeg = await optimizeImage(input, { format: 'jpeg' });
    expect(jpeg.format).toBe('jpeg');
    const png = await optimizeImage(input, { format: 'png' });
    expect(png.format).toBe('png');
  });

  it('throws ImageProcessingError (not UnsupportedFormatError) for invalid, non-HEIC input', async () => {
    const garbage = Buffer.from('this is not an image');
    await expect(optimizeImage(garbage)).rejects.toBeInstanceOf(ImageProcessingError);
  });

  it('converts a HEIC photo to WebP', async () => {
    const result = await optimizeImage(sampleHeic, { format: 'webp' }, { filename: 'IMG_0001.HEIC' });
    expect(result.format).toBe('webp');
    expect(result.width).toBe(64);
    expect(result.height).toBe(48);
  });

  it('converts a HEIC photo even when its filename and mime type do not say HEIC', async () => {
    const result = await optimizeImage(sampleHeic, { format: 'webp' }, { filename: 'photo.jpg', mimeType: 'image/jpeg' });
    expect(result.format).toBe('webp');
    expect(result.width).toBe(64);
  });

  it('converts a mislabeled HEIC photo whose major brand is mif1', async () => {
    const mif1Major = Buffer.from(sampleHeic);
    mif1Major.write('mif1', 8, 'ascii');
    const result = await optimizeImage(mif1Major, { format: 'webp' }, { filename: 'photo.jpg', mimeType: 'image/jpeg' });
    expect(result.format).toBe('webp');
    expect(result.width).toBe(64);
  });

  it('throws UnsupportedFormatError when a HEIC file cannot be decoded', async () => {
    const corrupt = Buffer.from('not really a heic file');
    await expect(optimizeImage(corrupt, {}, { filename: 'broken.heic' })).rejects.toBeInstanceOf(
      UnsupportedFormatError
    );
  });
});
