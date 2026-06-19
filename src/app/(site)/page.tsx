import Link from "next/link";
import Image from "next/image";
import { Calendar, Mail, MapPin, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { ParallaxHeroImage } from "@/components/ui/ParallaxHeroImage";
import { siteConfig } from "@/data/site-config";
import { getUpcomingEvents, getVideos } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export const revalidate = 60;

function getYouTubeId(url: string): string | null {
  if (!url) return null;

  try {
    const patterns = [
      /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{10,12})/,
      /(?:youtu\.be\/)([a-zA-Z0-9_-]{10,12})/,
      /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{10,12})/,
      /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{10,12})/,
      /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{10,12})/,
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

function parseEventDate(dateStr: string): { month: string; day: string } {
  const date = new Date(dateStr);
  return {
    month: date.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    day: String(date.getDate()),
  };
}

export default async function HomePage() {
  let upcomingEvents: any[] = [];
  let videos: any[] = [];
  try {
    upcomingEvents = await getUpcomingEvents();
  } catch (error) {
    console.warn('Unable to fetch events:', error);
  }
  try {
    videos = await getVideos();
  } catch (error) {
    console.warn('Unable to fetch videos:', error);
  }
  const displayEvents = upcomingEvents.slice(0, 3);
  const featuredVideo = videos.length > 0 ? videos[0] : null;

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-end overflow-hidden">
        <ParallaxHeroImage
          src="/images/kelso-performing-optimized.webp"
          alt="Kelso Kelly performing live"
        />

        {/* Decorative watermark */}
        <div
          aria-hidden="true"
          className="absolute top-0 right-0 font-display font-black text-amber-400 select-none pointer-events-none leading-none"
          style={{ fontSize: 'clamp(120px, 28vw, 400px)', opacity: 0.05, lineHeight: 1 }}
        >
          KK
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 w-full">
          <div className="animate-fade-in max-w-2xl">
            <p className="text-amber-400 text-sm font-medium tracking-[0.2em] uppercase mb-4">
              Northern Colorado Musician
            </p>

            <h1 className="animate-fade-in animation-delay-100 font-display font-black text-white drop-shadow-2xl leading-[0.9] mb-6"
              style={{ fontSize: 'clamp(4rem, 12vw, 9rem)' }}>
              Kelso<br />
              <em className="italic text-amber-400 not-italic" style={{ fontStyle: 'italic' }}>Kelly</em>
            </h1>

            <p className="animate-fade-in animation-delay-200 text-lg md:text-xl text-zinc-300 max-w-xl mb-6 drop-shadow-lg leading-relaxed">
              {siteConfig.description}
            </p>

            <div className="animate-fade-in animation-delay-200 flex flex-wrap gap-2 mb-10">
              {siteConfig.genres.map((genre: string) => (
                <Badge key={genre} variant="amber" className="backdrop-blur-sm">
                  {genre}
                </Badge>
              ))}
            </div>

            <div className="animate-fade-in animation-delay-300 flex flex-wrap items-center gap-4">
              <Link href="/contact">
                <Button size="lg" className="gap-2">
                  <Mail className="h-5 w-5" />
                  Book a Show
                </Button>
              </Link>
              <div className="w-px h-6 bg-white/20" />
              <Link
                href="/schedule"
                className="text-zinc-300 hover:text-white transition-colors text-sm font-medium tracking-wide flex items-center gap-1"
              >
                See Schedule <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#0a0704] to-transparent" />
      </section>

      {/* Featured Video Section */}
      {featuredVideo && (
        <section className="py-24 bg-[#070504]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="font-display text-3xl md:text-4xl font-bold text-white mb-4">
                Watch Kelso Perform
              </h2>
              <p className="text-zinc-400 text-lg">
                Experience the energy and artistry of a live performance
              </p>
            </div>

            <div className="max-w-5xl mx-auto">
              <div className="relative aspect-video overflow-hidden bg-zinc-900 shadow-2xl shadow-black/60">
                {(() => {
                  const youtubeId = getYouTubeId(featuredVideo.youtube_url);
                  return youtubeId ? (
                    <iframe
                      src={`https://www.youtube.com/embed/${youtubeId}?rel=0`}
                      title={featuredVideo.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="absolute inset-0 w-full h-full border-0"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
                      <p className="text-zinc-500 text-sm text-center">
                        Unable to load video
                      </p>
                    </div>
                  );
                })()}
              </div>
              {featuredVideo.description && (
                <p className="text-center text-zinc-400 mt-6">
                  {featuredVideo.description}
                </p>
              )}
              <div className="text-center mt-6">
                <Link href="/media">
                  <Button variant="secondary" className="gap-2">
                    View All Videos &amp; Photos
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Upcoming Shows */}
      <section className="py-24 bg-[#0a0704]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-white mb-4">
              Upcoming Shows
            </h2>
            <p className="text-zinc-400 text-lg">
              Catch Kelso live at these upcoming performances
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {displayEvents.map((event: any) => {
              const { month, day } = parseEventDate(event.date);
              return (
                <Card key={event.id} hover>
                  <CardContent className="p-0 flex overflow-hidden">
                    <div className="bg-amber-500/10 border-r border-amber-500/15 px-4 py-5 flex flex-col items-center justify-center min-w-[64px] shrink-0">
                      <span className="text-[10px] font-semibold tracking-widest uppercase text-amber-500 mb-1">
                        {month}
                      </span>
                      <span className="font-display text-3xl font-black text-white leading-none">
                        {day}
                      </span>
                    </div>
                    <div className="p-5">
                      <h3 className="text-base font-semibold text-white mb-2 leading-snug">
                        {event.title}
                      </h3>
                      {event.venue && (
                        <div className="flex items-start gap-1.5 text-zinc-400 mb-2">
                          <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-amber-500/70" />
                          <span className="text-sm">{event.venue}</span>
                        </div>
                      )}
                      {event.time && event.time.toLowerCase() !== 'all day' && (
                        <span className="inline-block text-[11px] font-medium tracking-wide text-amber-500 bg-amber-500/10 rounded px-2 py-0.5">
                          {event.time}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="text-center mt-12">
            <Link href="/schedule">
              <Button variant="secondary" className="gap-2">
                View All Shows
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Bio Teaser */}
      <section className="py-24 bg-[#100c07]/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="font-display text-3xl md:text-4xl font-bold text-white mb-8">
                Experience Live Music at Its Best
              </h2>
              <blockquote className="font-display text-2xl md:text-3xl italic text-zinc-200 leading-relaxed border-l-2 border-amber-500 pl-6 mb-8">
                &ldquo;40 years of playing music — pop, R&B, country — and a story for every song.&rdquo;
              </blockquote>
              <p className="text-zinc-400 text-lg mb-8">
                Whether it&apos;s a solo acoustic set or performing with the Cattywampus Duo,
                Kelso tailors every show to create the perfect atmosphere for your event.
              </p>
              <Link href="/bio">
                <Button variant="outline" className="gap-2">
                  Learn More About Kelso
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>

            <div className="relative">
              <div className="aspect-square rounded-2xl overflow-hidden bg-zinc-800">
                <Image
                  src="/images/performance-optimized.webp"
                  alt="Kelso Kelly performing live with acoustic guitar"
                  width={960}
                  height={960}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-amber-500/20 rounded-full blur-3xl" />
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-[#0a0704]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-display text-3xl md:text-5xl font-bold italic text-white mb-6">
            Let&apos;s make your event memorable.
          </h2>
          <p className="text-zinc-400 text-lg mb-10 max-w-2xl mx-auto">
            Weddings, house concerts, backyard BBQs, corporate events, venue bookings —
            Kelso tailors every set to the moment and the crowd.
          </p>
          <Link href="/contact">
            <Button size="lg" variant="outline" className="gap-2 uppercase tracking-widest text-sm">
              <Mail className="h-4 w-4" />
              Book Kelso
            </Button>
          </Link>
          <p className="mt-4 text-sm text-zinc-600">
            or email <a href={`mailto:${siteConfig.email}`} className="text-zinc-500 hover:text-amber-500 transition-colors">{siteConfig.email}</a>
          </p>
        </div>
      </section>
    </div>
  );
}
