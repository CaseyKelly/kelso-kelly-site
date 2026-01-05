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
 * Optimize an image using Sharp
 * - Resize to max dimensions
 * - Convert to WebP format (best compression)
 * - Compress with specified quality
 * 
 * @param inputBuffer The input image buffer
 * @param options Optimization options
 */
export async function optimizeImage(
  inputBuffer: Buffer,
  options: ImageOptimizationOptions = {}
): Promise<OptimizedImage> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 85,
    format = 'webp',
  } = options;

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
    throw new Error(`Failed to optimize image: ${error}`);
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
