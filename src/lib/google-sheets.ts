import { google } from 'googleapis';

// Initialize Google Sheets API with service account
function getSheetsClient() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error('Google service account credentials not configured');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  return google.sheets({ version: 'v4', auth });
}

export interface SheetVideo {
  title: string;
  youtubeUrl: string;
  category?: 'live' | 'music-video' | 'interview';
  description?: string;
  orderIndex?: number;
}

/**
 * Extract YouTube video ID from URL to get thumbnail
 */
function getYouTubeThumbnail(url: string): string | null {
  try {
    const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
    if (videoIdMatch && videoIdMatch[1]) {
      return `https://img.youtube.com/vi/${videoIdMatch[1]}/maxresdefault.jpg`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse category string to valid category type
 */
function parseCategory(category?: string): 'live' | 'music-video' | 'interview' | undefined {
  if (!category) return undefined;
  
  const normalized = category.toLowerCase().trim();
  
  if (normalized === 'live' || normalized.includes('live')) return 'live';
  if (normalized === 'music-video' || normalized.includes('music')) return 'music-video';
  if (normalized === 'interview') return 'interview';
  
  return undefined;
}

/**
 * Fetch videos from a Google Sheet
 * 
 * Expected sheet format:
 * Row 1: Headers (Title, YouTube URL, Category, Description, Order)
 * Row 2+: Data
 * 
 * @param spreadsheetId The Google Sheets spreadsheet ID
 * @param sheetName The name of the sheet/tab (default: 'Videos')
 */
export async function fetchVideosFromSheet(
  spreadsheetId: string,
  sheetName: string = 'Videos'
): Promise<SheetVideo[]> {
  const sheets = getSheetsClient();
  
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:E`, // Columns A through E (Title, URL, Category, Description, Order)
    });

    const rows = response.data.values;
    
    if (!rows || rows.length === 0) {
      return [];
    }

    // Skip header row
    const dataRows = rows.slice(1);
    
    const videos: SheetVideo[] = [];
    
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      
      // Skip empty rows
      if (!row || row.length === 0) continue;
      
      const [title, youtubeUrl, category, description, order] = row;
      
      // Title and YouTube URL are required
      if (!title || !youtubeUrl) continue;
      
      // Skip rows that don't have valid YouTube URLs
      const urlLower = youtubeUrl.toLowerCase();
      if (!urlLower.includes('youtube.com') && !urlLower.includes('youtu.be')) {
        console.warn(`Invalid YouTube URL in row ${i + 2}: ${youtubeUrl}`);
        continue;
      }
      
      videos.push({
        title: title.trim(),
        youtubeUrl: youtubeUrl.trim(),
        category: parseCategory(category),
        description: description?.trim() || undefined,
        orderIndex: order ? parseInt(order) : i,
      });
    }
    
    return videos;
  } catch (error) {
    console.error('Error fetching videos from Google Sheet:', error);
    throw new Error(`Failed to fetch videos from sheet: ${error}`);
  }
}

/**
 * Fetch videos with thumbnail URLs
 */
export async function fetchVideosFromSheetWithThumbnails(
  spreadsheetId: string,
  sheetName: string = 'Videos'
): Promise<Array<SheetVideo & { thumbnailUrl?: string }>> {
  const videos = await fetchVideosFromSheet(spreadsheetId, sheetName);
  
  return videos.map(video => ({
    ...video,
    thumbnailUrl: getYouTubeThumbnail(video.youtubeUrl) || undefined,
  }));
}

/**
 * Get the last modified time of a spreadsheet (for caching purposes)
 */
export async function getSpreadsheetLastModified(spreadsheetId: string): Promise<string | null> {
  const drive = google.drive({ 
    version: 'v3', 
    auth: new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
        private_key: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    })
  });
  
  try {
    const response = await drive.files.get({
      fileId: spreadsheetId,
      fields: 'modifiedTime',
    });
    
    return response.data.modifiedTime || null;
  } catch (error) {
    console.error('Error getting spreadsheet modified time:', error);
    return null;
  }
}
