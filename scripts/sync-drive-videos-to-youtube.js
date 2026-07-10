#!/usr/bin/env node

/**
 * Uploads new videos from a Google Drive folder to YouTube, then appends
 * the resulting title + URL to the Google Sheet that feeds the site's
 * existing video sync (see src/lib/sync.ts -> syncVideos).
 *
 * Intended to run on a schedule via GitHub Actions (see
 * .github/workflows/sync-drive-videos-to-youtube.yml) rather than as a
 * Vercel serverless function, since video uploads can take far longer than
 * a function timeout allows.
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY  - Drive read + Sheet write
 *     (the service account needs Editor access on the Sheet, not just Viewer)
 *   GOOGLE_DRIVE_VIDEOS_FOLDER_ID  - Drive folder to watch for new videos
 *   GOOGLE_VIDEOS_SHEET_ID         - Sheet consumed by syncVideos()
 *   YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
 *     - see scripts/get-youtube-refresh-token.js
 *   DATABASE_URL - tracks which Drive files are already uploaded
 * Optional:
 *   YOUTUBE_PRIVACY_STATUS - 'public' | 'unlisted' | 'private' (default: 'unlisted')
 */

const { google } = require('googleapis');
const { neon } = require('@neondatabase/serverless');

const REQUIRED_ENV_VARS = [
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_PRIVATE_KEY',
  'GOOGLE_DRIVE_VIDEOS_FOLDER_ID',
  'GOOGLE_VIDEOS_SHEET_ID',
  'YOUTUBE_CLIENT_ID',
  'YOUTUBE_CLIENT_SECRET',
  'YOUTUBE_REFRESH_TOKEN',
  'DATABASE_URL',
];

function getServiceAccountAuth(scopes) {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes,
  });
}

function getYoutubeAuth() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  return oauth2Client;
}

function stripExtension(fileName) {
  return fileName.replace(/\.[^/.]+$/, '');
}

async function main() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  const sql = neon(process.env.DATABASE_URL);

  const drive = google.drive({
    version: 'v3',
    auth: getServiceAccountAuth(['https://www.googleapis.com/auth/drive.readonly']),
  });
  const sheets = google.sheets({
    version: 'v4',
    auth: getServiceAccountAuth(['https://www.googleapis.com/auth/spreadsheets']),
  });
  const youtube = google.youtube({ version: 'v3', auth: getYoutubeAuth() });

  console.log('Listing video files in Drive folder...');
  const { data } = await drive.files.list({
    q: `'${process.env.GOOGLE_DRIVE_VIDEOS_FOLDER_ID}' in parents and trashed = false and mimeType contains 'video/'`,
    fields: 'files(id, name, mimeType)',
    orderBy: 'createdTime',
    pageSize: 1000,
  });
  const files = data.files || [];
  console.log(`Found ${files.length} video file(s) in Drive folder`);

  let uploadedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const existing = await sql`
      SELECT id FROM youtube_uploads WHERE drive_file_id = ${file.id}
    `;
    if (existing.length > 0) {
      skippedCount += 1;
      continue;
    }

    console.log(`Uploading "${file.name}" to YouTube...`);
    const title = stripExtension(file.name);

    const driveStream = await drive.files.get(
      { fileId: file.id, alt: 'media' },
      { responseType: 'stream' }
    );

    const uploadResponse = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: { title },
        status: { privacyStatus: process.env.YOUTUBE_PRIVACY_STATUS || 'unlisted' },
      },
      media: { body: driveStream.data },
    });

    const videoId = uploadResponse.data.id;
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`Uploaded "${title}" -> ${youtubeUrl}`);

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_VIDEOS_SHEET_ID,
      range: 'Videos!A:E',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[title, youtubeUrl]] },
    });

    await sql`
      INSERT INTO youtube_uploads (drive_file_id, drive_file_name, youtube_video_id, youtube_url)
      VALUES (${file.id}, ${file.name}, ${videoId}, ${youtubeUrl})
    `;

    uploadedCount += 1;
    console.log(`Recorded upload and appended sheet row for "${file.name}"`);
  }

  console.log(`Done. Uploaded ${uploadedCount}, skipped ${skippedCount} already-uploaded file(s).`);
}

main().catch((error) => {
  console.error('Drive -> YouTube sync failed:', error);
  process.exit(1);
});
