import { google } from 'googleapis';
import { Readable } from 'stream';

// Initialize Google Drive API with service account
function getDriveClient() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error('Google service account credentials not configured');
  }

  console.log('Initializing Google Drive client...');
  console.log('Service account email:', process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const drive = google.drive({ 
      version: 'v3', 
      auth,
    });

    console.log('Google Drive client initialized successfully');
    return drive;
  } catch (error) {
    console.error('Failed to initialize Google Drive client:', error);
    throw error;
  }
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  modifiedTime: string;
  size?: string;
}

/**
 * List all files in a Google Drive folder
 * @param folderId The Google Drive folder ID
 * @param mimeTypeFilter Optional MIME type filter (e.g., 'image/jpeg')
 */
export async function listFilesInFolder(
  folderId: string,
  mimeTypeFilter?: string
): Promise<DriveFile[]> {
  const drive = getDriveClient();
  
  try {
    let query = `'${folderId}' in parents and trashed = false`;
    
    if (mimeTypeFilter) {
      query += ` and mimeType contains '${mimeTypeFilter}'`;
    }
    
    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name, mimeType, createdTime, modifiedTime, size)',
      orderBy: 'createdTime desc',
      pageSize: 1000, // Max allowed
    });

    return (response.data.files || []) as DriveFile[];
  } catch (error) {
    console.error('Error listing files from Google Drive:', error);
    throw new Error(`Failed to list files from folder: ${error}`);
  }
}

/**
 * List all image files in a folder
 */
export async function listImageFilesInFolder(folderId: string): Promise<DriveFile[]> {
  const drive = getDriveClient();
  
  try {
    const query = `'${folderId}' in parents and trashed = false and (mimeType contains 'image/')`;
    
    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name, mimeType, createdTime, modifiedTime, size)',
      orderBy: 'createdTime desc',
      pageSize: 1000,
    });

    return (response.data.files || []) as DriveFile[];
  } catch (error) {
    console.error('Error listing image files from Google Drive:', error);
    throw new Error(`Failed to list image files from folder: ${error}`);
  }
}

/**
 * Download a file from Google Drive as a Buffer
 * @param fileId The Google Drive file ID
 */
export async function downloadFile(fileId: string): Promise<Buffer> {
  const drive = getDriveClient();
  
  try {
    const response = await drive.files.get(
      {
        fileId: fileId,
        alt: 'media',
      },
      {
        responseType: 'stream',
      }
    );

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    const stream = response.data as unknown as Readable;
    
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  } catch (error) {
    console.error('Error downloading file from Google Drive:', error);
    throw new Error(`Failed to download file: ${error}`);
  }
}

/**
 * Get file metadata from Google Drive
 */
export async function getFileMetadata(fileId: string): Promise<DriveFile> {
  const drive = getDriveClient();
  
  try {
    const response = await drive.files.get({
      fileId: fileId,
      fields: 'id, name, mimeType, createdTime, modifiedTime, size',
    });

    return response.data as DriveFile;
  } catch (error) {
    console.error('Error getting file metadata from Google Drive:', error);
    throw new Error(`Failed to get file metadata: ${error}`);
  }
}

/**
 * Get folder metadata and verify it exists
 */
export async function getFolderMetadata(folderId: string) {
  const drive = getDriveClient();
  
  try {
    const response = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, mimeType',
    });

    if (response.data.mimeType !== 'application/vnd.google-apps.folder') {
      throw new Error('Specified ID is not a folder');
    }

    return response.data;
  } catch (error) {
    console.error('Error getting folder metadata:', error);
    throw new Error(`Failed to get folder metadata: ${error}`);
  }
}

/**
 * Find a folder by name within a parent folder
 */
export async function findFolderByName(
  parentFolderId: string,
  folderName: string
): Promise<string | null> {
  const drive = getDriveClient();
  
  try {
    const query = `'${parentFolderId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    
    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      pageSize: 1,
    });

    const folders = response.data.files || [];
    return folders.length > 0 ? folders[0].id! : null;
  } catch (error) {
    console.error('Error finding folder by name:', error);
    return null;
  }
}

/**
 * Set up a webhook watch for Drive folder changes
 * Google Drive push notifications require a publicly accessible HTTPS endpoint
 */
export async function watchFolder(webhookUrl: string, channelId: string, folderId: string) {
  const drive = getDriveClient();
  
  try {
    // Webhook expires after 24 hours for Drive, will need to be renewed
    const expiration = Date.now() + (24 * 60 * 60 * 1000);
    
    const response = await drive.files.watch({
      fileId: folderId,
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
    console.error('Error setting up Drive webhook:', error);
    throw new Error(`Failed to set up Drive webhook: ${error}`);
  }
}

/**
 * Stop watching a Drive channel
 */
export async function stopWatchingFolder(channelId: string, resourceId: string) {
  const drive = getDriveClient();
  
  try {
    await drive.channels.stop({
      requestBody: {
        id: channelId,
        resourceId: resourceId,
      },
    });
  } catch (error) {
    console.error('Error stopping Drive watch:', error);
    throw new Error(`Failed to stop Drive watch: ${error}`);
  }
}

/**
 * Helper to parse category from folder name or file path
 */
export function getCategoryFromFolderName(folderName: string): 'performance' | 'backstage' | 'press' | 'promo' | null {
  const normalized = folderName.toLowerCase().trim();
  
  if (normalized.includes('performance')) return 'performance';
  if (normalized.includes('backstage')) return 'backstage';
  if (normalized.includes('press')) return 'press';
  if (normalized.includes('promo')) return 'promo';
  
  return null;
}

/**
 * Helper to clean filename for use as title/alt text
 */
export function cleanFilenameForTitle(filename: string): string {
  // Remove file extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  
  // Replace hyphens, underscores with spaces
  let cleaned = nameWithoutExt.replace(/[-_]/g, ' ');
  
  // Capitalize first letter of each word
  cleaned = cleaned.replace(/\b\w/g, char => char.toUpperCase());
  
  return cleaned;
}
