import { Metadata } from "next";
import { Music2, CheckCircle } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { bio } from "@/data/bio";

export const metadata: Metadata = {
  title: "Bio",
  description: "Learn about Kelso Kelly's musical journey spanning over 40 years of performances across Colorado.",
};

export default function BioPage() {
  const fullBioText = bio.fullBio;

  return (
    <div className="min-h-screen py-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title="About Kelso"
          subtitle="A lifetime of making music and creating memories"
        />

        <div className="grid gap-12">
          <div className="prose prose-invert max-w-none">
            <div className="bg-zinc-900/50 rounded-2xl p-8 border border-zinc-800 mb-12">
              <p className="text-xl text-zinc-300 leading-relaxed m-0">
                {bio.intro}
              </p>
            </div>

            <div className="space-y-6 text-zinc-400">
              {fullBioText.split("\n\n").map((paragraph: string, index: number) => (
                <p key={index} className="leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <Card>
              <CardContent className="p-8">
                <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                  <Music2 className="h-5 w-5 text-amber-500" />
                  Highlights
                </h3>
                <ul className="space-y-4">
                  {bio.highlights.map((highlight: string, index: number) => (
                    <li key={index} className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <span className="text-zinc-300">{highlight}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-8">
                <h3 className="text-xl font-semibold text-white mb-6">
                  Musical Journey
                </h3>
                <div className="space-y-6">
                  {bio.timeline.map((item: { year: string; event: string }, index: number) => (
                    <div key={index} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-3 h-3 rounded-full bg-amber-500" />
                        {index < bio.timeline.length - 1 && (
                          <div className="w-px h-full bg-zinc-700 mt-2" />
                        )}
                      </div>
                      <div className="pb-6">
                        <p className="text-sm text-amber-500 font-medium mb-1">
                          {item.year}
                        </p>
                        <p className="text-zinc-300">{item.event}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
