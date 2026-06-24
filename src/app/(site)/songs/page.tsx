import { Metadata } from "next";
import { songs } from "@/data/songs";
import SongsClient from "./SongsClient";

export const metadata: Metadata = {
  title: "Song List",
  description:
    "Browse Kelso Kelly's repertoire — pop, R&B, country, rock, and classic standards performed live across Northern Colorado.",
  alternates: { canonical: "/songs" },
};

export default function SongsPage() {
  return <SongsClient songs={songs} />;
}
