#!/usr/bin/env node

/**
 * Simple script to optimize an image for web use
 * Usage: node scripts/optimize-image.js <input-path> <output-path>
 * Example: node scripts/optimize-image.js ~/Desktop/photo.jpg public/images/kelso-performing.jpg
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function optimizeImage(inputPath, outputPath) {
  try {
    console.log(`Reading: ${inputPath}`);
    
    // Get original metadata
    const metadata = await sharp(inputPath).metadata();
    console.log(`Original: ${metadata.width}x${metadata.height}, ${metadata.format}, ${Math.round(metadata.size / 1024)}KB`);
    
    // Optimize the image
    const output = await sharp(inputPath)
      .resize(1920, 1920, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
    
    // Get optimized metadata
    const optimizedMetadata = await sharp(output).metadata();
    console.log(`Optimized: ${optimizedMetadata.width}x${optimizedMetadata.height}, webp, ${Math.round(output.length / 1024)}KB`);
    console.log(`Savings: ${Math.round((1 - output.length / metadata.size) * 100)}%`);
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write to file
    fs.writeFileSync(outputPath, output);
    console.log(`✓ Saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('Error optimizing image:', error.message);
    process.exit(1);
  }
}

// Get command line arguments
const args = process.argv.slice(2);

if (args.length !== 2) {
  console.log('Usage: node scripts/optimize-image.js <input-path> <output-path>');
  console.log('Example: node scripts/optimize-image.js ~/Desktop/photo.jpg public/images/kelso-performing.jpg');
  process.exit(1);
}

const [inputPath, outputPath] = args;

optimizeImage(inputPath, outputPath);
