import { google } from 'googleapis';

// Initialize Google Calendar API with service account
function getCalendarClient() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error('Google service account credentials not configured');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });

  return google.calendar({ version: 'v3', auth });
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD format
  time: string; // e.g., "7:00 PM"
  venue?: string;
  address?: string;
  description?: string;
  ticketUrl?: string;
}

/**
 * Parse location field from Google Calendar
 * Attempts to split into venue name and address
 */
function parseLocation(location?: string | null): { venue?: string; address?: string } {
  if (!location) return {};
  
  // If location contains a comma, assume first part is venue name, rest is address
  const parts = location.split(',');
  if (parts.length > 1) {
    return {
      venue: parts[0].trim(),
      address: location, // Keep full address
    };
  }
  
  // Otherwise, treat entire string as venue
  return {
    venue: location.trim(),
  };
}

/**
 * Parse description to extract ticket URL if present
 * Looks for URLs in the description text
 */
function parseDescription(description?: string | null): { description?: string; ticketUrl?: string } {
  if (!description) return {};
  
  // Look for ticket URL patterns
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = description.match(urlRegex);
  
  // If we find a URL that looks like a ticket link, extract it
  const ticketUrl = urls?.find(url => 
    url.includes('ticket') || 
    url.includes('event') || 
    url.includes('eventbrite') ||
    url.includes('seetickets')
  );
  
  return {
    description,
    ticketUrl,
  };
}

/**
 * Format time from Google Calendar event
 * Google Calendar API returns datetime in the event's timezone (e.g., "2024-01-15T19:00:00-08:00")
 * We need to parse this and display it in the original timezone, not convert to UTC
 */
function formatTime(dateTime?: string | null, date?: string | null): string {
  if (!dateTime && !date) return 'TBD';
  
  // If it's an all-day event, return generic time
  if (date && !dateTime) return 'All Day';
  
  // Extract the time portion from the ISO string
  // Example: "2024-01-15T19:00:00-08:00" -> "19:00:00"
  const timePart = dateTime!.split('T')[1];
  if (!timePart) return 'TBD';
  
  // Parse hours and minutes from the time string (before timezone offset)
  const [hoursStr, minutesStr] = timePart.split(':');
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);
  
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes > 0 ? `:${minutes.toString().padStart(2, '0')}` : '';
  
  return `${displayHours}${displayMinutes} ${ampm}`;
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(dateTime?: string | null, date?: string | null): string {
  if (date) return date;
  if (dateTime) return dateTime.split('T')[0];
  return new Date().toISOString().split('T')[0];
}

/**
 * Fetch events from Google Calendar
 * @param maxResults Maximum number of events to fetch (default: 50)
 * @param timeMin Minimum time to fetch events from (default: now)
 */
export async function fetchCalendarEvents(
  maxResults = 50,
  timeMin?: Date
): Promise<CalendarEvent[]> {
  if (!process.env.GOOGLE_CALENDAR_ID) {
    throw new Error('GOOGLE_CALENDAR_ID not configured');
  }

  const calendar = getCalendarClient();
  
  try {
    const response = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      timeMin: (timeMin || new Date()).toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    
    return events.map(event => {
      const location = parseLocation(event.location);
      const { description, ticketUrl } = parseDescription(event.description);
      
      return {
        id: event.id!,
        title: event.summary || 'Untitled Event',
        date: formatDate(event.start?.dateTime, event.start?.date),
        time: formatTime(event.start?.dateTime, event.start?.date),
        venue: location.venue,
        address: location.address,
        description,
        ticketUrl,
      };
    });
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    throw new Error(`Failed to fetch calendar events: ${error}`);
  }
}

/**
 * Fetch all events (past and future) from Google Calendar
 */
export async function fetchAllCalendarEvents(maxResults = 100): Promise<CalendarEvent[]> {
  if (!process.env.GOOGLE_CALENDAR_ID) {
    throw new Error('GOOGLE_CALENDAR_ID not configured');
  }

  const calendar = getCalendarClient();
  
  try {
    const response = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    
    return events.map(event => {
      const location = parseLocation(event.location);
      const { description, ticketUrl } = parseDescription(event.description);
      
      return {
        id: event.id!,
        title: event.summary || 'Untitled Event',
        date: formatDate(event.start?.dateTime, event.start?.date),
        time: formatTime(event.start?.dateTime, event.start?.date),
        venue: location.venue,
        address: location.address,
        description,
        ticketUrl,
      };
    });
  } catch (error) {
    console.error('Error fetching all calendar events:', error);
    throw new Error(`Failed to fetch calendar events: ${error}`);
  }
}

/**
 * Set up a webhook watch for calendar changes
 * Google Calendar push notifications require a publicly accessible HTTPS endpoint
 */
export async function watchCalendar(webhookUrl: string, channelId: string) {
  if (!process.env.GOOGLE_CALENDAR_ID) {
    throw new Error('GOOGLE_CALENDAR_ID not configured');
  }

  const calendar = getCalendarClient();
  
  try {
    // Webhook expires after 7 days, will need to be renewed
    const expiration = Date.now() + (7 * 24 * 60 * 60 * 1000);
    
    const response = await calendar.events.watch({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
        expiration: expiration.toString(),
      },
    });

    return {
      channelId: response.data.id!,
      resourceId: response.data.resourceId!,
      expiration: parseInt(response.data.expiration || '0'),
    };
  } catch (error) {
    console.error('Error setting up calendar webhook:', error);
    throw new Error(`Failed to set up calendar webhook: ${error}`);
  }
}

/**
 * Stop watching a calendar channel
 */
export async function stopWatchingCalendar(channelId: string, resourceId: string) {
  const calendar = getCalendarClient();
  
  try {
    await calendar.channels.stop({
      requestBody: {
        id: channelId,
        resourceId: resourceId,
      },
    });
  } catch (error) {
    console.error('Error stopping calendar watch:', error);
    throw new Error(`Failed to stop calendar watch: ${error}`);
  }
}
