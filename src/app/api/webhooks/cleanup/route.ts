import { NextRequest, NextResponse } from 'next/server';
import { getWebhookChannels, deleteWebhookChannel } from '@/lib/db';
import { stopWatchingFolder } from '@/lib/google-drive';
import { stopWatchingCalendar } from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/cleanup
 * Stop old webhook channels and clean up database
 * Keeps only the most recent webhook for each resource type
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Authentication check
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.WEBHOOK_SETUP_SECRET}`;
  
  if (!process.env.WEBHOOK_SETUP_SECRET || authHeader !== expectedAuth) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const channels = await getWebhookChannels();
    
    // Group channels by resource type
    const driveChannels = channels.filter(c => c.resource_type === 'drive')
      .sort((a: any, b: any) => b.expiration - a.expiration); // newest first
    
    const calendarChannels = channels.filter(c => c.resource_type === 'calendar')
      .sort((a: any, b: any) => b.expiration - a.expiration); // newest first
    
    const results = {
      stopped: [] as string[],
      deleted: [] as string[],
      kept: [] as string[],
      errors: [] as string[],
    };
    
    // Keep only the newest Drive channel, stop the rest
    for (let i = 0; i < driveChannels.length; i++) {
      const channel: any = driveChannels[i];
      
      if (i === 0) {
        // Keep the newest one
        results.kept.push(channel.channel_id);
        console.log(`Keeping newest Drive webhook: ${channel.channel_id}`);
        continue;
      }
      
      // Stop old ones
      try {
        console.log(`Stopping old Drive webhook: ${channel.channel_id}`);
        await stopWatchingFolder(channel.channel_id, channel.resource_id);
        results.stopped.push(channel.channel_id);
        
        // Delete from database
        await deleteWebhookChannel(channel.channel_id);
        results.deleted.push(channel.channel_id);
      } catch (error) {
        console.error(`Failed to stop ${channel.channel_id}:`, error);
        results.errors.push(`${channel.channel_id}: ${error}`);
        
        // Still try to delete from database even if Google API fails
        try {
          await deleteWebhookChannel(channel.channel_id);
          results.deleted.push(channel.channel_id);
        } catch (dbError) {
          console.error(`Failed to delete ${channel.channel_id} from DB:`, dbError);
        }
      }
    }
    
    // Keep only the newest Calendar channel, stop the rest
    for (let i = 0; i < calendarChannels.length; i++) {
      const channel: any = calendarChannels[i];
      
      if (i === 0) {
        // Keep the newest one
        results.kept.push(channel.channel_id);
        console.log(`Keeping newest Calendar webhook: ${channel.channel_id}`);
        continue;
      }
      
      // Stop old ones
      try {
        console.log(`Stopping old Calendar webhook: ${channel.channel_id}`);
        await stopWatchingCalendar(channel.channel_id, channel.resource_id);
        results.stopped.push(channel.channel_id);
        
        // Delete from database
        await deleteWebhookChannel(channel.channel_id);
        results.deleted.push(channel.channel_id);
      } catch (error) {
        console.error(`Failed to stop ${channel.channel_id}:`, error);
        results.errors.push(`${channel.channel_id}: ${error}`);
        
        // Still try to delete from database even if Google API fails
        try {
          await deleteWebhookChannel(channel.channel_id);
          results.deleted.push(channel.channel_id);
        } catch (dbError) {
          console.error(`Failed to delete ${channel.channel_id} from DB:`, dbError);
        }
      }
    }
    
    return NextResponse.json({
      success: results.errors.length === 0,
      message: results.errors.length === 0 
        ? 'Cleanup completed successfully' 
        : 'Cleanup completed with some errors',
      results,
    });
  } catch (error) {
    console.error('Error during webhook cleanup:', error);
    return NextResponse.json(
      { error: `Failed to cleanup webhooks: ${error}` },
      { status: 500 }
    );
  }
}
