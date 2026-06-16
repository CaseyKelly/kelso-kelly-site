import Link from "next/link";
import Image from "next/image";
import { Calendar, Music2, Mail, MapPin, ArrowRight } from "lucide-react";
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
    // Handle various YouTube URL formats:
    // - https://www.youtube.com/watch?v=VIDEO_ID
    // - https://youtube.com/watch?v=VIDEO_ID
    // - https://youtu.be/VIDEO_ID
    // - https://www.youtube.com/embed/VIDEO_ID
    // - https://www.youtube.com/v/VIDEO_ID
    // - https://www.youtube.com/shorts/VIDEO_ID
    
    const patterns = [
      /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{10,12})/,  // youtube.com/watch?v=
      /(?:youtu\.be\/)([a-zA-Z0-9_-]{10,12})/,              // youtu.be/
      /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{10,12})/,    // youtube.com/embed/
      /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{10,12})/,        // youtube.com/v/
      /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{10,12})/,   // youtube.com/shorts/
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

export default async function HomePage() {
  // Fetch upcoming events and videos, but handle case where database isn't available (e.g., during build)
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
      {/* Hero Section with Background Image */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        {/* Background Image with Parallax Effect */}
        <ParallaxHeroImage 
          src="/images/kelso-performing-optimized.webp"
          alt="Kelso Kelly performing live"
        />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
            <div className="animate-fade-in">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/20 backdrop-blur-sm border border-amber-500/30 mb-8">
                <Music2 className="h-4 w-4 text-amber-400" />
                <span className="text-amber-400 text-sm font-medium">
                  {siteConfig.tagline}
                </span>
              </div>
            </div>

          <h1 className="animate-fade-in animation-delay-100 text-5xl md:text-7xl lg:text-8xl font-bold text-white mb-6 tracking-tight drop-shadow-2xl">
            {siteConfig.name}
          </h1>

          <p className="animate-fade-in animation-delay-200 text-xl md:text-2xl text-zinc-200 max-w-3xl mx-auto mb-8 drop-shadow-lg">
            {siteConfig.description}
          </p>

          <div className="animate-fade-in animation-delay-200 flex flex-wrap justify-center gap-3 mb-12">
            {siteConfig.genres.map((genre: string) => (
              <Badge key={genre} variant="amber" className="backdrop-blur-sm">
                {genre}
              </Badge>
            ))}
          </div>

          <div className="animate-fade-in animation-delay-300 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/schedule">
              <Button size="lg" className="gap-2">
                <Calendar className="h-5 w-5" />
                View Upcoming Shows
              </Button>
            </Link>
            <Link href="/contact">
              <Button size="lg" variant="outline" className="gap-2 backdrop-blur-sm">
                <Mail className="h-5 w-5" />
                Book Kelso
              </Button>
            </Link>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-zinc-950 to-transparent" />
      </section>

      {/* Featured Video Section */}
      {featuredVideo && (
        <section className="py-24 bg-zinc-900/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Watch Kelso Perform
              </h2>
              <p className="text-zinc-400 text-lg">
                Experience the energy and artistry of a live performance
              </p>
            </div>
            
            <div className="max-w-5xl mx-auto">
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-zinc-900 shadow-2xl">
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
                      <Music2 className="h-12 w-12 text-zinc-600" />
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
                    <Music2 className="h-4 w-4" />
                    View All Videos & Photos
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="py-24 bg-zinc-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Upcoming Shows
            </h2>
            <p className="text-zinc-400 text-lg">
              Catch Kelso live at these upcoming performances
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {displayEvents.map((event: any) => (
              <Card key={event.id} hover>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-sm text-zinc-500">{event.time}</span>
                  </div>
                  
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {event.title}
                  </h3>
                  
                  <div className="flex items-center gap-2 text-zinc-400 mb-4">
                    <Calendar className="h-4 w-4" />
                    <span className="text-sm">{formatDate(event.date)}</span>
                  </div>
                  
                  <div className="flex items-start gap-2 text-zinc-400">
                    <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-zinc-300">{event.venue}</p>
                      {event.address && (
                        <p className="text-sm">{event.address}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
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

      <section className="py-24 bg-zinc-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                Experience Live Music at Its Best
              </h2>
              <p className="text-zinc-400 text-lg mb-6">
                With over 40 years of musical experience, Kelso brings a unique blend of 
                pop, R&B, and country to every performance. Whether it&apos;s a solo acoustic 
                set or performing with the Cattywampus Duo, each show is tailored to 
                create the perfect atmosphere for your event.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  "Extensive repertoire spanning multiple genres",
                  "Customized song selection for any occasion",
                  "Engaging stories and audience interaction",
                  "Available for private events and venues",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-zinc-300">
                    <Music2 className="h-5 w-5 text-amber-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
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

      <section className="py-24 bg-zinc-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Book Your Event?
          </h2>
          <p className="text-zinc-400 text-lg mb-8">
            Whether it&apos;s a wedding, corporate event, private party, or venue booking, 
            Kelso is ready to make your event unforgettable.
          </p>
          <Link href="/contact">
            <Button size="lg" className="gap-2">
              <Mail className="h-5 w-5" />
              Get in Touch
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
