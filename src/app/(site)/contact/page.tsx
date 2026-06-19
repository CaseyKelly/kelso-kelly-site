import { Mail, MapPin, Music } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { siteConfig } from "@/data/site-config";

export default function ContactPage() {
  return (
    <div className="min-h-screen py-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title="Get in Touch"
          subtitle="Interested in booking Kelso for your event? Have questions? Send an email!"
        />

        <div className="grid md:grid-cols-3 gap-8 mb-12">
          <Card>
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="h-6 w-6 text-amber-500" />
              </div>
              <h3 className="font-semibold text-white mb-2">Email</h3>
              <a
                href={`mailto:${siteConfig.email}`}
                className="text-zinc-400 hover:text-amber-500 transition-colors text-sm break-all"
              >
                {siteConfig.email}
              </a>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPin className="h-6 w-6 text-amber-500" />
              </div>
              <h3 className="font-semibold text-white mb-2">Location</h3>
              <p className="text-zinc-400 text-sm">Northern Colorado</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Music className="h-6 w-6 text-amber-500" />
              </div>
              <h3 className="font-semibold text-white mb-2">Available For</h3>
              <p className="text-zinc-400 text-sm">
                Venues, Weddings, House Concerts, Backyard BBQs & More
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-8 text-center">
            <div className="max-w-2xl mx-auto">
              <div className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Mail className="h-10 w-10 text-amber-500" />
              </div>
              <h2 className="font-display text-2xl font-bold italic text-white mb-4">Ready to Book?</h2>
              <p className="text-zinc-400 mb-8">
                Send an email to discuss your event, check availability, or ask any questions. 
                Include details about your event type, date, and location.
              </p>
              <a 
                href={`mailto:${siteConfig.email}`}
                className="inline-flex items-center justify-center gap-2 px-8 py-3 text-lg font-medium rounded-lg bg-amber-500 text-zinc-950 hover:bg-amber-400 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-950 focus:ring-amber-500"
              >
                <Mail className="h-5 w-5" />
                Send Email
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
