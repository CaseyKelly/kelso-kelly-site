import { Song } from "@/types";

export const songs: Song[] = [
  { id: "1", title: "Uptown Funk", artist: "Bruno Mars", genre: "pop" },
  { id: "2", title: "Happy", artist: "Pharrell Williams", genre: "pop" },
  { id: "3", title: "Blinding Lights", artist: "The Weeknd", genre: "pop" },
  { id: "4", title: "Shape of You", artist: "Ed Sheeran", genre: "pop" },
  { id: "5", title: "Can't Stop the Feeling", artist: "Justin Timberlake", genre: "pop" },
  { id: "6", title: "Treasure", artist: "Bruno Mars", genre: "pop" },
  { id: "7", title: "24K Magic", artist: "Bruno Mars", genre: "pop" },
  { id: "8", title: "Locked Out of Heaven", artist: "Bruno Mars", genre: "pop" },
  
  { id: "9", title: "Ain't No Sunshine", artist: "Bill Withers", genre: "rnb" },
  { id: "10", title: "Lean on Me", artist: "Bill Withers", genre: "rnb" },
  { id: "11", title: "Stand By Me", artist: "Ben E. King", genre: "rnb" },
  { id: "12", title: "What's Going On", artist: "Marvin Gaye", genre: "rnb" },
  { id: "13", title: "Let's Stay Together", artist: "Al Green", genre: "rnb" },
  { id: "14", title: "I Heard It Through the Grapevine", artist: "Marvin Gaye", genre: "rnb" },
  { id: "15", title: "Superstition", artist: "Stevie Wonder", genre: "rnb" },
  { id: "16", title: "Signed, Sealed, Delivered", artist: "Stevie Wonder", genre: "rnb" },
  { id: "17", title: "Sir Duke", artist: "Stevie Wonder", genre: "rnb" },
  { id: "18", title: "Isn't She Lovely", artist: "Stevie Wonder", genre: "rnb" },
  
  { id: "19", title: "Wagon Wheel", artist: "Darius Rucker", genre: "country" },
  { id: "20", title: "Chicken Fried", artist: "Zac Brown Band", genre: "country" },
  { id: "21", title: "Toes", artist: "Zac Brown Band", genre: "country" },
  { id: "22", title: "Cruise", artist: "Florida Georgia Line", genre: "country" },
  { id: "23", title: "Die a Happy Man", artist: "Thomas Rhett", genre: "country" },
  { id: "24", title: "Body Like a Back Road", artist: "Sam Hunt", genre: "country" },
  { id: "25", title: "Tennessee Whiskey", artist: "Chris Stapleton", genre: "country" },
  { id: "26", title: "Somethin' 'Bout a Truck", artist: "Kip Moore", genre: "country" },
  { id: "27", title: "Drunk on a Plane", artist: "Dierks Bentley", genre: "country" },
  { id: "28", title: "Need You Now", artist: "Lady A", genre: "country" },
  
  { id: "29", title: "Sweet Home Alabama", artist: "Lynyrd Skynyrd", genre: "rock" },
  { id: "30", title: "Brown Eyed Girl", artist: "Van Morrison", genre: "rock" },
  { id: "31", title: "Free Fallin'", artist: "Tom Petty", genre: "rock" },
  { id: "32", title: "American Pie", artist: "Don McLean", genre: "rock" },
  { id: "33", title: "Hotel California", artist: "Eagles", genre: "rock" },
  { id: "34", title: "Take It Easy", artist: "Eagles", genre: "rock" },
  { id: "35", title: "Peaceful Easy Feeling", artist: "Eagles", genre: "rock" },
  { id: "36", title: "Old Time Rock and Roll", artist: "Bob Seger", genre: "rock" },
  
  { id: "37", title: "Fly Me to the Moon", artist: "Frank Sinatra", genre: "classic" },
  { id: "38", title: "The Way You Look Tonight", artist: "Frank Sinatra", genre: "classic" },
  { id: "39", title: "What a Wonderful World", artist: "Louis Armstrong", genre: "classic" },
  { id: "40", title: "Georgia on My Mind", artist: "Ray Charles", genre: "classic" },
  { id: "41", title: "Unchained Melody", artist: "Righteous Brothers", genre: "classic" },
  { id: "42", title: "Can't Help Falling in Love", artist: "Elvis Presley", genre: "classic" },
];

export const genreLabels: Record<string, string> = {
  pop: "Pop",
  rnb: "Old-School R&B",
  country: "Modern Country",
  rock: "Classic Rock",
  classic: "Standards & Classics",
  other: "Other",
};
