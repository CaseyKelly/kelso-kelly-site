'use client';

import { useState, useMemo } from 'react';
import { Search, Music, Filter } from 'lucide-react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

const genreLabels: Record<string, string> = {
  pop: 'Pop',
  rnb: 'Old-School R&B',
  country: 'Modern Country',
  rock: 'Classic Rock',
  classic: 'Standards & Classics',
  other: 'Other',
};

interface Song {
  id?: string;
  title: string;
  artist: string;
  genre: string;
  notes?: string;
}

export default function SongsClient({ songs }: { songs: Song[] }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);

  const availableGenres = useMemo(() => {
    const genres = new Set(songs.map((s) => s.genre));
    return Array.from(genres).filter((g) => genreLabels[g]);
  }, [songs]);

  const filteredSongs = useMemo(() => {
    return songs.filter((song) => {
      const matchesSearch =
        searchQuery === '' ||
        song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        song.artist.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesGenre = selectedGenre === null || song.genre === selectedGenre;

      return matchesSearch && matchesGenre;
    });
  }, [songs, searchQuery, selectedGenre]);

  const groupedSongs = useMemo(() => {
    const groups: Record<string, Song[]> = {};
    filteredSongs.forEach((song) => {
      if (!groups[song.genre]) {
        groups[song.genre] = [];
      }
      groups[song.genre].push(song);
    });
    return groups;
  }, [filteredSongs]);

  return (
    <div className="min-h-screen py-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title="Song List"
          subtitle="Browse Kelso's extensive repertoire of songs available for performance"
        />

        <div className="mb-8 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search by song title or artist..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-[#100c07] border border-[rgba(245,158,11,0.15)] rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-zinc-500" />
            <button
              onClick={() => setSelectedGenre(null)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                selectedGenre === null ? 'bg-amber-500 text-zinc-950' : 'bg-[#1e1710] text-zinc-300 hover:bg-[#2a2010]'
              )}
            >
              All
            </button>
            {availableGenres.map((genre) => (
              <button
                key={genre}
                onClick={() => setSelectedGenre(genre)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  selectedGenre === genre ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                )}
              >
                {genreLabels[genre] || genre}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 text-sm text-zinc-500">
          Showing {filteredSongs.length} of {songs.length} songs
        </div>

        {filteredSongs.length > 0 ? (
          <div className="space-y-8">
            {Object.entries(groupedSongs).map(([genre, genreSongs]) => (
              <div key={genre}>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Music className="h-5 w-5 text-amber-500" />
                  {genreLabels[genre] || genre}
                  <Badge variant="default" className="ml-2">
                    {genreSongs.length}
                  </Badge>
                </h3>
                <div className="bg-[#100c07] rounded-xl border border-[rgba(245,158,11,0.12)] overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[rgba(245,158,11,0.12)]">
                        <th className="text-left py-3 px-4 text-sm font-medium text-zinc-500">Song</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-zinc-500">Artist</th>
                      </tr>
                    </thead>
                    <tbody>
                      {genreSongs.map((song, index) => (
                        <tr
                          key={song.id || `${song.title}-${song.artist}-${index}`}
                          className={cn(
                            'transition-colors hover:bg-amber-500/5',
                            index < genreSongs.length - 1 && 'border-b border-[rgba(245,158,11,0.08)]'
                          )}
                        >
                          <td className="py-3 px-4 text-white">{song.title}</td>
                          <td className="py-3 px-4 text-zinc-400">{song.artist}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <Music className="h-16 w-16 text-zinc-700 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No Songs Found</h3>
            <p className="text-zinc-400">Try adjusting your search or filter criteria.</p>
          </div>
        )}

        <div className="mt-12 p-6 bg-[#100c07]/60 rounded-xl border border-[rgba(245,158,11,0.12)] text-center">
          <p className="text-zinc-400">
            Don&apos;t see a song you&apos;d like to hear?{' '}
            <a href="/contact" className="text-amber-500 hover:text-amber-400 transition-colors">
              Contact Kelso
            </a>{' '}
            with requests — he&apos;s always learning new material!
          </p>
        </div>
      </div>
    </div>
  );
}
