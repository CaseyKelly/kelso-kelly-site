// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { JsonLd } from './JsonLd';

describe('JsonLd', () => {
  it('renders the data as a JSON-LD script tag', () => {
    const { container } = render(<JsonLd data={{ '@type': 'MusicEvent', name: 'Live Show' }} />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    expect(
      JSON.parse(
        script!.innerHTML
          .replace(/\\u0026/g, '&')
          .replace(/\\u003c/g, '<')
          .replace(/\\u003e/g, '>')
      )
    ).toEqual({
      '@type': 'MusicEvent',
      name: 'Live Show',
    });
  });

  it('escapes &, <, and > to prevent breaking out of the script tag', () => {
    const { container } = render(<JsonLd data={{ name: 'Rock & Roll <script>alert(1)</script>' }} />);
    const script = container.querySelector('script[type="application/ld+json"]')!;
    expect(script.innerHTML).not.toContain('<script>alert');
    expect(script.innerHTML).toContain('\\u0026');
    expect(script.innerHTML).toContain('\\u003c');
    expect(script.innerHTML).toContain('\\u003e');
  });
});
