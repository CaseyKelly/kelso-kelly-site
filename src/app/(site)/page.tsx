import Link from "next/link";
import Image from "next/image";
import { Calendar, Music2, Mail, MapPin, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { siteConfig } from "@/data/site-config";
import { getUpcomingEvents } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export const revalidate = 60;

export default async function HomePage() {
  // Fetch upcoming events, but handle case where database isn't available (e.g., during build)
  let upcomingEvents: any[] = [];
  try {
    upcomingEvents = await getUpcomingEvents();
  } catch (error) {
    console.warn('Unable to fetch events:', error);
  }
  const displayEvents = upcomingEvents.slice(0, 3);

  return (
    <div className="flex flex-col">
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-500/10 via-zinc-950 to-zinc-950" />
        <div className="absolute inset-0 bg-[url('/images/hero-pattern.svg')] opacity-5" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
            <div className="animate-fade-in">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-8">
                <MapPin className="h-4 w-4 text-amber-500" />
                <span className="text-amber-400 text-sm font-medium">
                  {siteConfig.tagline}
                </span>
              </div>
            </div>

          <h1 className="animate-fade-in animation-delay-100 text-5xl md:text-7xl lg:text-8xl font-bold text-white mb-6 tracking-tight">
            {siteConfig.name}
          </h1>

          <p className="animate-fade-in animation-delay-200 text-xl md:text-2xl text-zinc-400 max-w-3xl mx-auto mb-8">
            {siteConfig.description}
          </p>

          <div className="animate-fade-in animation-delay-200 flex flex-wrap justify-center gap-3 mb-12">
            {siteConfig.genres.map((genre: string) => (
              <Badge key={genre} variant="amber">
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
              <Button size="lg" variant="outline" className="gap-2">
                <Mail className="h-5 w-5" />
                Book Kelso
              </Button>
            </Link>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-zinc-950 to-transparent" />
      </section>

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
                  src="/images/kelso-performing-optimized.webp"
                  alt="Kelso Kelly performing live with acoustic guitar"
                  width={960}
                  height={960}
                  className="w-full h-full object-cover"
                  priority
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
