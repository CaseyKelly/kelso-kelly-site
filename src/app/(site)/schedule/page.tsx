import { Metadata } from "next";
import { Calendar, MapPin, Clock, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getUpcomingEvents, getPastEvents } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export const revalidate = 3600; // 1 hour

export const metadata: Metadata = {
  title: "Schedule",
  description: "View upcoming shows and performances by Kelso Kelly across Northern Colorado.",
};

function EventCard({ event, isPast = false }: { event: any; isPast?: boolean }) {
  return (
    <Card hover={!isPast} className={isPast ? "opacity-60" : ""}>
      <CardContent className="p-6">
        {event.time && event.time.toLowerCase() !== 'all day' && (
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-1 text-sm text-zinc-500">
              <Clock className="h-4 w-4" />
              {event.time}
            </div>
          </div>
        )}

        <h3 className="text-xl font-semibold text-white mb-3">{event.title}</h3>

        <div className="space-y-3 mb-4">
          <div className="flex items-center gap-2 text-zinc-400">
            <Calendar className="h-4 w-4 flex-shrink-0 text-amber-500" />
            <span>{formatDate(event.date)}</span>
          </div>

          {event.venue && (
            <div className="flex items-start gap-2 text-zinc-400">
              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-500" />
              <div>
                <p className="font-medium text-zinc-300">{event.venue}</p>
                {event.address && <p className="text-sm">{event.address}</p>}
              </div>
            </div>
          )}
        </div>

        {event.description && (
          <p className="text-zinc-500 text-sm mb-4">{event.description}</p>
        )}

        {event.ticket_url && !isPast && (
          <a href={event.ticket_url} target="_blank" rel="noopener noreferrer">
            <Button size="sm" className="gap-2">
              Get Tickets
              <ExternalLink className="h-4 w-4" />
            </Button>
          </a>
        )}
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

  return (
    <div className="min-h-screen py-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title="Upcoming Shows"
          subtitle="Catch Kelso live at venues across Northern Colorado"
        />

        {upcomingEvents.length > 0 ? (
          <div className="space-y-6">
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
            <h2 className="text-2xl font-bold text-white mb-8">Past Shows</h2>
            <div className="space-y-6">
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
