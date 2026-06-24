import { Metadata } from "next";
import { Calendar, MapPin, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { JsonLd } from "@/components/JsonLd";
import { getUpcomingEvents, getPastEvents } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Upcoming Shows",
  description:
    "Catch Kelso Kelly live at venues across Fort Collins, Loveland, Greeley, and Northern Colorado. View the full show schedule and get tickets.",
  alternates: { canonical: "/schedule" },
};

function parseEventDate(dateStr: string): { month: string; day: string } {
  const date = new Date(dateStr);
  return {
    month: date.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    day: String(date.getDate()),
  };
}

function EventCard({ event, isPast = false }: { event: any; isPast?: boolean }) {
  const { month, day } = parseEventDate(event.date);
  return (
    <Card hover={!isPast} className={isPast ? "opacity-50" : ""}>
      <CardContent className="p-0 flex overflow-hidden">
        {/* Date block */}
        <div className="bg-amber-500/10 border-r border-amber-500/15 px-5 py-5 flex flex-col items-center justify-center min-w-[72px] shrink-0">
          <span className="text-[10px] font-semibold tracking-widest uppercase text-amber-500 mb-1">
            {month}
          </span>
          <span className="font-display text-4xl font-black text-white leading-none">
            {day}
          </span>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-white mb-2 leading-snug">{event.title}</h3>

          <div className="space-y-1.5 mb-3">
            <div className="flex items-center gap-2 text-zinc-400 text-sm">
              <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-amber-500/70" />
              <span>{formatDate(event.date)}</span>
            </div>

            {event.venue && (
              <div className="flex items-start gap-2 text-zinc-400">
                <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-amber-500/70" />
                <div>
                  <span className="text-sm font-medium text-zinc-300">{event.venue}</span>
                  {event.address && <p className="text-sm">{event.address}</p>}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {event.time && event.time.toLowerCase() !== 'all day' && (
              <span className="inline-block text-[11px] font-medium tracking-wide text-amber-500 bg-amber-500/10 rounded px-2 py-0.5">
                {event.time}
              </span>
            )}
            {event.description && (
              <p className="text-zinc-500 text-sm">{event.description}</p>
            )}
          </div>

          {event.ticket_url && !isPast && (
            <div className="mt-3">
              <a href={event.ticket_url} target="_blank" rel="noopener noreferrer">
                <Button size="sm" className="gap-2">
                  Get Tickets
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </a>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function SchedulePage() {
  let upcomingEvents: any[] = [];
  let pastEvents: any[] = [];

  try {
    const [upcoming, past] = await Promise.all([
      getUpcomingEvents(),
      getPastEvents(5)
    ]);
    upcomingEvents = upcoming;
    pastEvents = past;
  } catch (error) {
    console.warn('Unable to fetch events:', error);
  }

  const eventSchema = upcomingEvents.length > 0
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        itemListElement: upcomingEvents.map((event: any, index: number) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "MusicEvent",
            name: event.title,
            startDate: event.date,
            performer: {
              "@type": "MusicGroup",
              name: "Kelso Kelly",
              url: "https://www.kelsokellymusic.com",
            },
            location: event.venue
              ? {
                  "@type": "Place",
                  name: event.venue,
                  address: event.address || "Northern Colorado",
                }
              : {
                  "@type": "Place",
                  address: {
                    "@type": "PostalAddress",
                    addressRegion: "CO",
                    addressCountry: "US",
                  },
                },
            url: event.ticket_url || "https://www.kelsokellymusic.com/schedule",
            ...(event.description && { description: event.description }),
          },
        })),
      }
    : null;

  return (
    <div className="min-h-screen py-24">
      {eventSchema && <JsonLd data={eventSchema} />}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title="Upcoming Shows"
          subtitle="Catch Kelso live at venues across Northern Colorado"
        />

        {upcomingEvents.length > 0 ? (
          <div className="space-y-4">
            {upcomingEvents.map((event: any) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <Calendar className="h-16 w-16 text-zinc-700 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              No Upcoming Shows
            </h3>
            <p className="text-zinc-400">
              Check back soon for new show announcements!
            </p>
          </div>
        )}

        {pastEvents.length > 0 && (
          <div className="mt-16">
            <h2 className="font-display text-2xl font-bold text-white mb-8">Past Shows</h2>
            <div className="space-y-4">
              {pastEvents.map((event: any) => (
                <EventCard key={event.id} event={event} isPast />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
