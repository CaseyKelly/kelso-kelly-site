import { describe, it, expect } from 'vitest';
import { getCategoryFromFolderName, cleanFilenameForTitle } from './google-drive';

describe('getCategoryFromFolderName', () => {
  it('matches known category keywords case-insensitively', () => {
    expect(getCategoryFromFolderName('Performance Photos')).toBe('performance');
    expect(getCategoryFromFolderName('BACKSTAGE')).toBe('backstage');
    expect(getCategoryFromFolderName('press kit')).toBe('press');
    expect(getCategoryFromFolderName('Promo Shots')).toBe('promo');
  });

  it('trims whitespace before matching', () => {
    expect(getCategoryFromFolderName('  performance  ')).toBe('performance');
  });

  it('returns null when no keyword matches', () => {
    expect(getCategoryFromFolderName('Miscellaneous')).toBeNull();
    expect(getCategoryFromFolderName('')).toBeNull();
  });
});

describe('cleanFilenameForTitle', () => {
  it('strips the file extension', () => {
    expect(cleanFilenameForTitle('sunset-show.jpg')).toBe('Sunset Show');
  });

  it('replaces hyphens and underscores with spaces', () => {
    expect(cleanFilenameForTitle('kelso_playing-guitar.png')).toBe('Kelso Playing Guitar');
  });

  it('capitalizes the first letter of each word', () => {
    expect(cleanFilenameForTitle('live at the aggie.webp')).toBe('Live At The Aggie');
  });

  it('handles filenames with multiple dots by only stripping the last extension', () => {
    expect(cleanFilenameForTitle('IMG.2026.08.15.jpeg')).toBe('IMG.2026.08.15');
  });

  it('handles filenames with no extension', () => {
    expect(cleanFilenameForTitle('no-extension-here')).toBe('No Extension Here');
  });

  it('leaves already-uppercase words as-is beyond the first letter', () => {
    expect(cleanFilenameForTitle('IMG_1234.jpg')).toBe('IMG 1234');
  });
});
