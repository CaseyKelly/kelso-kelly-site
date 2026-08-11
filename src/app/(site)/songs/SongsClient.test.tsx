// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SongsClient from './SongsClient';

const songs = [
  { id: '1', title: 'What Kinda Man', artist: 'Parker McCollum', genre: 'country' },
  { id: '2', title: 'Lovin on You', artist: 'Luke Combs', genre: 'country' },
  { id: '3', title: 'Ain’t No Mountain High Enough', artist: 'Marvin Gaye', genre: 'rnb' },
  { id: '4', title: 'Yellow', artist: 'Coldplay', genre: 'pop' },
];

describe('SongsClient', () => {
  it('shows every song grouped by genre initially', () => {
    render(<SongsClient songs={songs} />);
    expect(screen.getByText('Showing 4 of 4 songs')).toBeInTheDocument();
    expect(screen.getByText('What Kinda Man')).toBeInTheDocument();
    expect(screen.getByText('Yellow')).toBeInTheDocument();
  });

  it('filters by song title (case-insensitive)', async () => {
    render(<SongsClient songs={songs} />);
    await userEvent.type(screen.getByPlaceholderText(/search by song title or artist/i), 'yellow');

    expect(screen.getByText('Showing 1 of 4 songs')).toBeInTheDocument();
    expect(screen.getByText('Yellow')).toBeInTheDocument();
    expect(screen.queryByText('What Kinda Man')).not.toBeInTheDocument();
  });

  it('filters by artist name', async () => {
    render(<SongsClient songs={songs} />);
    await userEvent.type(screen.getByPlaceholderText(/search by song title or artist/i), 'combs');

    expect(screen.getByText('Showing 1 of 4 songs')).toBeInTheDocument();
    expect(screen.getByText('Lovin on You')).toBeInTheDocument();
  });

  it('filters by selected genre', async () => {
    render(<SongsClient songs={songs} />);
    await userEvent.click(screen.getByRole('button', { name: 'Old-School R&B' }));

    expect(screen.getByText('Showing 1 of 4 songs')).toBeInTheDocument();
    expect(screen.getByText('Ain’t No Mountain High Enough')).toBeInTheDocument();
    expect(screen.queryByText('Yellow')).not.toBeInTheDocument();
  });

  it('combines search and genre filters, showing an empty state when nothing matches', async () => {
    render(<SongsClient songs={songs} />);
    await userEvent.click(screen.getByRole('button', { name: 'Modern Country' }));
    await userEvent.type(screen.getByPlaceholderText(/search by song title or artist/i), 'Yellow');

    expect(screen.getByText('No Songs Found')).toBeInTheDocument();
  });

  it('resets the genre filter when "All" is clicked', async () => {
    render(<SongsClient songs={songs} />);
    await userEvent.click(screen.getByRole('button', { name: 'Modern Country' }));
    expect(screen.getByText('Showing 2 of 4 songs')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Showing 4 of 4 songs')).toBeInTheDocument();
  });
});
