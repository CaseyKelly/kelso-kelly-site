export interface Event {
  id: string;
  title: string;
  date: string;
  time: string;
  venue: string;
  address?: string;
  type: "solo" | "duo" | "band";
  description?: string;
  ticketUrl?: string;
  image?: string;
  status: "upcoming" | "cancelled" | "sold-out";
}

export interface Photo {
  id: string;
  src: string;
  alt: string;
  category: "performance" | "backstage" | "press" | "promo";
  width: number;
  height: number;
}

export interface Video {
  id: string;
  title: string;
  url: string;
  thumbnail?: string;
  category: "live" | "music-video" | "interview";
  description?: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  genre: "pop" | "rnb" | "country" | "rock" | "classic" | "other";
}

export interface SiteConfig {
  name: string;
  tagline: string;
  description: string;
  email: string;
  genres: string[];
  socialLinks: {
    facebook?: string;
    instagram?: string;
    youtube?: string;
    spotify?: string;
  };
}
