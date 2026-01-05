import { Event } from "@/types";

export const events: Event[] = [
  {
    id: "1",
    title: "Oskar Blues - Cattywampus Duo",
    date: "2025-12-19",
    time: "7:00 PM",
    venue: "Oskar Blues Brewery",
    address: "1555 S Hover St, Longmont, CO 80501",
    type: "duo",
    description: "Join Kelso and the Cattywampus Duo for an evening of great music and craft beer!",
    status: "upcoming",
  },
  {
    id: "2",
    title: "New Year's Eve Celebration",
    date: "2025-12-31",
    time: "8:00 PM",
    venue: "The Forge Publick House",
    address: "2532 11th Ave, Greeley, CO 80631",
    type: "solo",
    description: "Ring in the New Year with live acoustic music!",
    status: "upcoming",
  },
  {
    id: "3",
    title: "Winter Warm-Up Show",
    date: "2026-01-15",
    time: "6:30 PM",
    venue: "Brix Taphouse & Brewery",
    address: "813 8th St, Greeley, CO 80631",
    type: "solo",
    description: "Warm up with great tunes and cold brews.",
    status: "upcoming",
  },
];

export const pastEvents: Event[] = [
  {
    id: "p1",
    title: "Fall Festival Performance",
    date: "2025-10-15",
    time: "4:00 PM",
    venue: "Downtown Loveland",
    type: "band",
    status: "upcoming",
  },
];
