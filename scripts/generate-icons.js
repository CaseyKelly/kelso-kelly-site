#!/usr/bin/env node

/**
 * Generate favicon and Open Graph image with Music2 icon
 * Uses the same amber color scheme as the site
 */

const sharp = require('sharp');

async function generateIcons() {
  try {
    // Create 512x512 icon with gradient background (for favicon and OG)
    const iconSvg = `
      <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#f59e0b;stop-opacity:0.2" />
            <stop offset="100%" style="stop-color:#27272a;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="512" height="512" fill="url(#grad)"/>
        <g transform="translate(106, 106) scale(12.5)">
          <circle cx="8" cy="18" r="4" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M12 18V2l7 4" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
      </svg>
    `;

    console.log('Generating favicon.ico...');

    // Generate favicon.ico (32x32)
    await sharp(Buffer.from(iconSvg)).resize(32, 32).png().toFile('src/app/favicon.ico');

    console.log('✓ Generated: src/app/favicon.ico (32x32)');

    // Generate apple-touch-icon (180x180)
    await sharp(Buffer.from(iconSvg)).resize(180, 180).png().toFile('src/app/apple-icon.png');

    console.log('✓ Generated: src/app/apple-icon.png (180x180)');

    // Generate Open Graph image (1200x630)
    const ogSvg = `
      <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#f59e0b;stop-opacity:0.1" />
            <stop offset="100%" style="stop-color:#09090b;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="1200" height="630" fill="url(#grad)"/>
        <g transform="translate(450, 165) scale(12.5)">
          <circle cx="8" cy="18" r="4" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M12 18V2l7 4" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
        <text x="600" y="500" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="bold" fill="#ffffff" text-anchor="middle">Kelso Kelly</text>
        <text x="600" y="560" font-family="system-ui, -apple-system, sans-serif" font-size="28" fill="#a1a1aa" text-anchor="middle">Live Music in Northern Colorado</text>
      </svg>
    `;

    await sharp(Buffer.from(ogSvg)).png().toFile('src/app/opengraph-image.png');

    console.log('✓ Generated: src/app/opengraph-image.png (1200x630)');

    // Generate Twitter card (same as OG)
    await sharp(Buffer.from(ogSvg)).png().toFile('src/app/twitter-image.png');

    console.log('✓ Generated: src/app/twitter-image.png (1200x630)');

    console.log('\n✅ All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
