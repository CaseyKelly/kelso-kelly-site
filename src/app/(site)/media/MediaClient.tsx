"use client";

import { useState } from "react";
import Image from "next/image";
import { X, Play, Camera, Video } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

type Tab = "photos" | "videos";

interface Photo {
  id: number;
  title: string;
  optimized_url: string;
  alt_text: string | null;
  category: string;
  width: number | null;
  height: number | null;
}

interface VideoItem {
  id: number;
  title: string;
  youtube_url: string;
  thumbnail_url: string | null;
  category: string | null;
  description: string | null;
}

function getYouTubeId(url: string): string | null {
  if (!url) return null;
  
  try {
    // Handle various YouTube URL formats:
    // - https://www.youtube.com/watch?v=VIDEO_ID
    // - https://youtube.com/watch?v=VIDEO_ID
    // - https://youtu.be/VIDEO_ID
    // - https://www.youtube.com/embed/VIDEO_ID
    // - https://www.youtube.com/v/VIDEO_ID
    // - https://www.youtube.com/shorts/VIDEO_ID
    
    const patterns = [
      /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,  // youtube.com/watch?v=
      /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,              // youtu.be/
      /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,    // youtube.com/embed/
      /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,        // youtube.com/v/
      /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,   // youtube.com/shorts/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    console.warn('Could not extract YouTube ID from URL:', url);
    return null;
  } catch (error) {
    console.error('Error parsing YouTube URL:', error);
    return null;
  }
}

export default function MediaClient({ 
  photos, 
  videos 
}: { 
  photos: Photo[]; 
  videos: VideoItem[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("photos");
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

  return (
    <div className="min-h-screen py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title="Photos & Videos"
          subtitle="See Kelso in action at venues across Northern Colorado"
        />

        <div className="flex justify-center mb-12">
          <div className="inline-flex bg-zinc-900 rounded-xl p-1 border border-zinc-800">
            <button
              onClick={() => setActiveTab("photos")}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all",
                activeTab === "photos"
                  ? "bg-amber-500 text-zinc-950"
                  : "text-zinc-400 hover:text-white"
              )}
            >
              <Camera className="h-5 w-5" />
              Photos
            </button>
            <button
              onClick={() => setActiveTab("videos")}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all",
                activeTab === "videos"
                  ? "bg-amber-500 text-zinc-950"
                  : "text-zinc-400 hover:text-white"
              )}
            >
              <Video className="h-5 w-5" />
              Videos
            </button>
          </div>
        </div>

        {activeTab === "photos" && (
          <>
            {photos.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {photos.map((photo) => (
                  <button
                    key={photo.id}
                    onClick={() => setSelectedPhoto(photo)}
                    className="group relative aspect-square rounded-xl overflow-hidden bg-zinc-800 hover:ring-2 hover:ring-amber-500 transition-all"
                  >
                    <Image
                      src={photo.optimized_url}
                      alt={photo.alt_text || photo.title}
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 text-white font-medium transition-opacity">
                        View
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <Camera className="h-16 w-16 text-zinc-700 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">
                  Photos Coming Soon
                </h3>
                <p className="text-zinc-400">
                  Check back soon for photos from recent performances!
                </p>
              </div>
            )}
          </>
        )}

        {activeTab === "videos" && (
          <>
            {videos.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-6">
                {videos.map((video) => {
                  const youtubeId = getYouTubeId(video.youtube_url);
                  return (
                    <Card key={video.id} hover>
                      <div className="aspect-video relative bg-zinc-800 rounded-t-xl overflow-hidden">
                        {youtubeId ? (
                          <iframe
                            src={`https://www.youtube.com/embed/${youtubeId}`}
                            title={video.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            className="absolute inset-0 w-full h-full border-0"
                            loading="lazy"
                          />
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
                            <Play className="h-12 w-12 text-zinc-600" />
                            <p className="text-zinc-500 text-sm text-center">
                              Unable to load video
                            </p>
                            {process.env.NODE_ENV === 'development' && (
                              <p className="text-zinc-600 text-xs text-center font-mono break-all">
                                {video.youtube_url}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="text-lg font-semibold text-white mb-1">
                          {video.title}
                        </h3>
                        {video.description && (
                          <p className="text-zinc-400 text-sm">{video.description}</p>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16">
                <Video className="h-16 w-16 text-zinc-700 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">
                  Videos Coming Soon
                </h3>
                <p className="text-zinc-400">
                  Check back soon for video recordings of live performances!
                </p>
              </div>
            )}
          </>
        )}

        {selectedPhoto && (
          <div
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setSelectedPhoto(null)}
          >
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 p-2 text-white hover:text-amber-500 transition-colors"
            >
              <X className="h-8 w-8" />
            </button>
            <div className="relative max-w-4xl max-h-[90vh] w-full">
              <div className="relative aspect-video">
                <Image
                  src={selectedPhoto.optimized_url}
                  alt={selectedPhoto.alt_text || selectedPhoto.title}
                  fill
                  className="object-contain rounded-xl"
                />
              </div>
              <p className="text-center text-zinc-400 mt-4">{selectedPhoto.alt_text || selectedPhoto.title}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
