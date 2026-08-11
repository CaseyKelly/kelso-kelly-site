import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { isHeicFile, optimizeImage, ImageProcessingError } from './image-optimizer';

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
});
