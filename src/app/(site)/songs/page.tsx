import { Metadata } from "next";
import { songs } from "@/data/songs";
import SongsClient from "./SongsClient";

export const metadata: Metadata = {
  title: "Song List",
  description: "Browse Kelso Kelly's extensive repertoire of songs spanning pop, R&B, country, rock, and classic standards.",
};

export default function SongsPage() {
  return <SongsClient songs={songs} />;
}
