// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MediaClient from './MediaClient';

const photos = [
  {
    id: 1,
    title: 'Live Show',
    optimized_url: 'https://blob.example.com/1.webp',
    alt_text: 'Live show',
    category: 'performance',
    width: 800,
    height: 600,
  },
  {
    id: 2,
    title: 'Backstage',
    optimized_url: 'https://blob.example.com/2.webp',
    alt_text: null,
    category: 'backstage',
    width: 800,
    height: 600,
  },
];

const videos = [
  {
    id: 1,
    title: 'Full Set',
    youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    thumbnail_url: null,
    category: 'live',
    description: 'A great set',
  },
  {
    id: 2,
    title: 'Broken Link',
    youtube_url: 'not-a-real-url',
    thumbnail_url: null,
    category: null,
    description: null,
  },
];

describe('MediaClient', () => {
  it('shows the photo grid by default', () => {
    render(<MediaClient photos={photos} videos={videos} />);
    expect(screen.getByRole('button', { name: /photos/i })).toBeInTheDocument();
    expect(screen.getByAltText('Live show')).toBeInTheDocument();
    expect(screen.getByAltText('Backstage')).toBeInTheDocument();
  });

  it('shows the empty state when there are no photos', () => {
    render(<MediaClient photos={[]} videos={videos} />);
    expect(screen.getByText('Photos Coming Soon')).toBeInTheDocument();
  });

  it('switches to the videos tab and renders an embedded iframe for a valid YouTube URL', async () => {
    render(<MediaClient photos={photos} videos={videos} />);
    await userEvent.click(screen.getByRole('button', { name: /videos/i }));

    expect(screen.getByText('Full Set')).toBeInTheDocument();
    const iframe = document.querySelector('iframe[src*="dQw4w9WgXcQ"]');
    expect(iframe).not.toBeNull();
  });

  it('shows a graceful fallback instead of crashing for an unparseable video URL', async () => {
    render(<MediaClient photos={photos} videos={videos} />);
    await userEvent.click(screen.getByRole('button', { name: /videos/i }));

    expect(screen.getByText('Unable to load video')).toBeInTheDocument();
  });

  it('opens the lightbox when a photo is clicked, and closes it via the close button', async () => {
    render(<MediaClient photos={photos} videos={videos} />);
    const photoButtons = screen.getAllByRole('button').filter((b) => b.querySelector('img'));
    await userEvent.click(photoButtons[0]);

    // Lightbox shows a second, larger rendering of the same photo's alt text
    expect(screen.getAllByAltText('Live show').length).toBeGreaterThanOrEqual(2);

    const closeButton = document.querySelector('button.absolute.top-4.right-4') as HTMLElement;
    await userEvent.click(closeButton);
    expect(screen.getAllByAltText('Live show').length).toBe(1);
  });
});
