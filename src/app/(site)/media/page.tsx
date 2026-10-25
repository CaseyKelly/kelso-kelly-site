import { Metadata } from 'next';
import { getPhotos, getVideos, DbPhoto, DbVideo } from '@/lib/db';
import MediaClient from './MediaClient';

export const revalidate = 3600; // 1 hour

export const metadata: Metadata = {
  title: 'Photos & Videos',
  description:
    'Photos and videos of Kelso Kelly performing live at venues across Fort Collins, Loveland, and Northern Colorado.',
  alternates: { canonical: '/media' },
};

export default async function MediaPage() {
  let photos: DbPhoto[] = [];
  let videos: DbVideo[] = [];

  try {
    const [photosData, videosData] = await Promise.all([getPhotos(), getVideos()]);
    photos = photosData;
    videos = videosData;
  } catch (error) {
    console.warn('Unable to fetch media:', error);
  }

  return <MediaClient photos={photos} videos={videos} />;
}
