import sharp from 'sharp';

export interface OptimizedImage {
  buffer: Buffer;
  width: number;
  height: number;
  format: string;
  size: number;
}

export interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
}

/**
 * Error thrown when an image format is not supported by Sharp
 */
export class UnsupportedFormatError extends Error {
  constructor(format: string, originalError?: Error) {
    super(`Unsupported image format: ${format}`);
    this.name = 'UnsupportedFormatError';
    this.cause = originalError;
  }
}

/**
 * Error thrown when image processing fails for reasons other than unsupported format
 */
export class ImageProcessingError extends Error {
  constructor(message: string, originalError?: Error) {
    super(message);
    this.name = 'ImageProcessingError';
    this.cause = originalError;
  }
}

/**
 * Check if a file is HEIC/HEIF format based on filename and MIME type
 * HEIC files are not fully supported by Sharp in Vercel environments
 */
export function isHeicFile(filename: string, mimeType?: string): boolean {
  const ext = filename.toLowerCase();
  return ext.endsWith('.heic') ||
         ext.endsWith('.heif') ||
         mimeType?.toLowerCase().includes('heif') ||
         mimeType?.toLowerCase().includes('heic') ||
         false;
}

// ISO-BMFF brands used by HEVC-coded HEIF images (iPhone photos).
// Generic 'mif1'/'msf1' are deliberately excluded: they also cover AVIF, which Sharp reads natively.
const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

/**
 * Sniff the file header for a HEIC 'ftyp' box, so mislabeled files are still converted.
 * Checks the compatible brands too: a HEIC file may use generic 'mif1' as its
 * major brand and only list 'heic' among its compatible brands.
 */
export function hasHeicSignature(buffer: Buffer): boolean {
  if (buffer.length < 12 || buffer.toString('ascii', 4, 8) !== 'ftyp') return false;
  const majorBrand = buffer.toString('ascii', 8, 12);
  if (HEIC_BRANDS.has(majorBrand)) return true;
  if (AVIF_BRANDS.has(majorBrand)) return false;

  // Box layout: size(4) 'ftyp'(4) major_brand(4) minor_version(4) compatible_brands(4 each)
  const boxEnd = Math.min(buffer.readUInt32BE(0), buffer.length);
  for (let offset = 16; offset + 4 <= boxEnd; offset += 4) {
    if (HEIC_BRANDS.has(buffer.toString('ascii', offset, offset + 4))) return true;
  }
  return false;
}

/**
 * Decode a HEIC/HEIF image to JPEG so Sharp can process it.
 * Sharp's prebuilt libvips has no HEVC decoder, so we use heic-convert
 * (libheif compiled to WebAssembly), which needs no native binaries.
 */
async function convertHeicToJpeg(inputBuffer: Buffer, filename?: string): Promise<Buffer> {
  try {
    const { default: convert } = await import('heic-convert');
    const output = await convert({ buffer: inputBuffer, format: 'JPEG', quality: 1 });
    return Buffer.from(output);
  } catch (error) {
    const format = filename?.split('.').pop()?.toUpperCase() || 'HEIC/HEIF';
    throw new UnsupportedFormatError(format, error as Error);
  }
}

/**
 * Optimize an image using Sharp
 * - Convert HEIC/HEIF (e.g. iPhone photos) to JPEG first
 * - Resize to max dimensions
 * - Convert to WebP format (best compression)
 * - Compress with specified quality
 * 
 * @param inputBuffer The input image buffer
 * @param options Optimization options
 * @param metadata Optional metadata about the file (for better error messages)
 */
export async function optimizeImage(
  inputBuffer: Buffer,
  options: ImageOptimizationOptions = {},
  metadata?: { filename?: string; mimeType?: string }
): Promise<OptimizedImage> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 85,
    format = 'webp',
  } = options;

  // Converted outside the try below so a failed decode surfaces as the
  // UnsupportedFormatError thrown by convertHeicToJpeg, not an ImageProcessingError
  if (isHeicFile(metadata?.filename ?? '', metadata?.mimeType) || hasHeicSignature(inputBuffer)) {
    inputBuffer = await convertHeicToJpeg(inputBuffer, metadata?.filename);
  }

  try {
    let pipeline = sharp(inputBuffer);

    // Get original metadata
    const metadata = await pipeline.metadata();
    
    // Resize if needed (maintain aspect ratio)
    if (
      metadata.width && metadata.width > maxWidth ||
      metadata.height && metadata.height > maxHeight
    ) {
      pipeline = pipeline.resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Convert to specified format with quality settings
    if (format === 'webp') {
      pipeline = pipeline.webp({ quality });
    } else if (format === 'jpeg') {
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
    } else if (format === 'png') {
      pipeline = pipeline.png({ quality, compressionLevel: 9 });
    }

    // Execute the pipeline
    const buffer = await pipeline.toBuffer();
    const info = await sharp(buffer).metadata();

    return {
      buffer,
      width: info.width || 0,
      height: info.height || 0,
      format: info.format || format,
      size: buffer.length,
    };
  } catch (error) {
    console.error('Error optimizing image:', error);
    
    // Check if this is a HEIC/HEIF format error (libheif not available)
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('heif') || errorMessage.includes('HEIF')) {
      const format = metadata?.filename ? 
        metadata.filename.split('.').pop()?.toUpperCase() || 'HEIC/HEIF' : 'HEIC/HEIF';
      throw new UnsupportedFormatError(format, error as Error);
    }
    
    throw new ImageProcessingError(`Failed to optimize image: ${error}`, error as Error);
  }
}

/**
 * Create multiple sizes of an image (for responsive images)
 * Returns an object with different sizes
 */
export async function createResponsiveSizes(
  inputBuffer: Buffer,
  sizes: number[] = [640, 1024, 1920]
): Promise<Record<string, OptimizedImage>> {
  const results: Record<string, OptimizedImage> = {};

  for (const size of sizes) {
    const optimized = await optimizeImage(inputBuffer, {
      maxWidth: size,
      maxHeight: size,
    });

    results[`${size}w`] = optimized;
  }

  return results;
}

/**
 * Generate a thumbnail from an image
 */
export async function generateThumbnail(
  inputBuffer: Buffer,
  size: number = 400
): Promise<OptimizedImage> {
  try {
    const pipeline = sharp(inputBuffer)
      .resize(size, size, {
        fit: 'cover',
        position: 'center',
      })
      .webp({ quality: 80 });

    const buffer = await pipeline.toBuffer();
    const info = await sharp(buffer).metadata();

    return {
      buffer,
      width: info.width || size,
      height: info.height || size,
      format: info.format || 'webp',
      size: buffer.length,
    };
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    throw new Error(`Failed to generate thumbnail: ${error}`);
  }
}

/**
 * Validate that a buffer is a valid image
 */
export async function validateImage(buffer: Buffer): Promise<boolean> {
  try {
    const metadata = await sharp(buffer).metadata();
    return !!(metadata.width && metadata.height);
  } catch {
    return false;
  }
}

/**
 * Get image metadata without processing
 */
export async function getImageMetadata(buffer: Buffer) {
  try {
    return await sharp(buffer).metadata();
  } catch (error) {
    console.error('Error getting image metadata:', error);
    throw new Error(`Failed to get image metadata: ${error}`);
  }
}
