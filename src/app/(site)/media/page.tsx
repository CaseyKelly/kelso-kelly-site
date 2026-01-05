import { Metadata } from "next";
import { getPhotos, getVideos } from "@/lib/db";
import MediaClient from "./MediaClient";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Photos & Videos",
  description: "See Kelso Kelly in action at venues across Northern Colorado - photos and videos from live performances.",
};

export default async function MediaPage() {
  let photos: any[] = [];
  let videos: any[] = [];
  
  try {
    const [photosData, videosData] = await Promise.all([
      getPhotos(),
      getVideos(),
    ]);
    photos = photosData;
    videos = videosData;
  } catch (error) {
    console.warn('Unable to fetch media:', error);
  }
  
  return <MediaClient photos={photos} videos={videos} />;
}
