#!/usr/bin/env node

/**
 * One-time helper to obtain a YouTube OAuth refresh token.
 *
 * The YouTube Data API does not accept service-account auth for uploads —
 * it requires OAuth consent from the Google account that owns/manages the
 * channel. Run this once locally; the printed refresh token then goes into
 * the YOUTUBE_REFRESH_TOKEN GitHub Actions secret and is reused forever
 * (no need to repeat this flow) by scripts/sync-drive-videos-to-youtube.js.
 *
 * Prerequisites:
 *   1. In Google Cloud Console (same project as your service account),
 *      enable the "YouTube Data API v3".
 *   2. Create an OAuth 2.0 Client ID of type "Desktop app".
 *   3. Add http://localhost:53682/oauth2callback as an authorized redirect URI.
 *   4. Run: YOUTUBE_CLIENT_ID=... YOUTUBE_CLIENT_SECRET=... node scripts/get-youtube-refresh-token.js
 *   5. Sign in with the Google account that owns the YouTube channel.
 */

const http = require('http');
const { google } = require('googleapis');

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET env vars first.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // forces a refresh_token even if this account authorized before
  scope: ['https://www.googleapis.com/auth/youtube.upload'],
});

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/oauth2callback')) {
    res.end('Waiting for OAuth redirect...');
    return;
  }

  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.end(`Authorization failed: ${error}`);
    server.close();
    console.error(`Authorization failed: ${error}`);
    process.exit(1);
  }

  res.end('Authorization complete — you can close this tab and return to the terminal.');
  server.close();

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    console.error(
      '\nNo refresh token returned. This Google account may have already granted access previously.\n' +
        'Revoke access at https://myaccount.google.com/permissions and re-run this script.'
    );
    process.exit(1);
  }

  console.log('\nSave this as the YOUTUBE_REFRESH_TOKEN secret:\n');
  console.log(tokens.refresh_token);
  console.log('');
});

server.listen(PORT, () => {
  console.log(`Open this URL and sign in with the channel-owning Google account:\n\n${authUrl}\n`);
});
