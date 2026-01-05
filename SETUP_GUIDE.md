# Kelso Kelly Music - Setup Guide

This guide will walk you through setting up the Google Calendar + Google Drive integration for automated content management.

## Overview

The site now pulls content from:
- **Google Calendar** → Events/Shows
- **Google Drive** → Photos (organized by category)  
- **Google Sheet** → Videos (YouTube links)

All data is synced to a **Neon Postgres** database and cached for fast performance. Webhooks trigger automatic updates when content changes.

---

## Prerequisites

- [ ] Neon Postgres account (you have this)
- [ ] Vercel Pro account (you have this)
- [ ] Google Cloud account (free tier is fine)
- [ ] Google Workspace account (Gmail account works)

---

## Step 1: Google Cloud Setup (30-45 minutes)

### 1.1 Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click "Select a Project" → "New Project"
3. Project name: `kelso-kelly-music`
4. Click "Create"

### 1.2 Enable Required APIs

1. In the Cloud Console, go to "APIs & Services" → "Library"
2. Search for and enable each of these:
   - **Google Calendar API**
   - **Google Drive API**
   - **Google Sheets API**

### 1.3 Create Service Account

1. Go to "IAM & Admin" → "Service Accounts"
2. Click "Create Service Account"
3. Service account details:
   - Name: `kelso-site-service`
   - Description: `Service account for Kelso Kelly website`
   - Click "Create and Continue"
4. Grant access (skip this step, click "Continue")
5. Click "Done"

### 1.4 Create Service Account Key

1. Click on the service account you just created
2. Go to "Keys" tab
3. Click "Add Key" → "Create new key"
4. Select "JSON" format
5. Click "Create"
6. **Save this file securely** - you'll need it for environment variables

The JSON file will look like this:
```json
{
  "type": "service_account",
  "project_id": "...",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "kelso-site-service@....iam.gserviceaccount.com",
  ...
}
```

---

## Step 2: Google Calendar Setup

### 2.1 Create Calendar

1. Go to [Google Calendar](https://calendar.google.com)
2. On the left sidebar, click "+" next to "Other calendars"
3. Select "Create new calendar"
4. Name: `Kelso Kelly Shows`
5. Click "Create calendar"

### 2.2 Share Calendar with Service Account

1. Find your new calendar in the left sidebar
2. Click the three dots → "Settings and sharing"
3. Scroll to "Share with specific people"
4. Click "Add people"
5. Enter the **service account email** from the JSON file (looks like: `kelso-site-service@....iam.gserviceaccount.com`)
6. Set permission to "Make changes to events"
7. Click "Send"

### 2.3 Get Calendar ID

1. Still in calendar settings, scroll to "Integrate calendar"
2. Copy the **Calendar ID** (looks like: `abc123@group.calendar.google.com`)
3. Save this for environment variables

---

## Step 3: Google Drive Setup

### 3.1 Create Folder Structure

1. Go to [Google Drive](https://drive.google.com)
2. Create a new folder: `KelsoKellyMusic`
3. Inside `KelsoKellyMusic`, create a folder: `photos`
4. Inside `photos`, create these 4 folders:
   - `performance`
   - `backstage`
   - `press`
   - `promo`

Your structure should look like:
```
KelsoKellyMusic/
└── photos/
    ├── performance/
    ├── backstage/
    ├── press/
    └── promo/
```

### 3.2 Share Folder with Service Account

1. Right-click the `KelsoKellyMusic` folder
2. Click "Share"
3. Enter the **service account email**
4. Set permission to "Viewer" (service account only needs to read)
5. Uncheck "Notify people" (service account won't receive emails)
6. Click "Share"

### 3.3 Get Folder ID

1. Open the `photos` folder
2. Look at the URL in your browser:
   ```
   https://drive.google.com/drive/folders/FOLDER_ID_HERE
   ```
3. Copy the folder ID (the part after `/folders/`)
4. Save this for environment variables

---

## Step 4: Google Sheet for Videos

### 4.1 Create Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet
3. Name it: `Kelso Kelly Videos`
4. In the first sheet, rename the tab to: `Videos`

### 4.2 Set Up Headers

In row 1, add these column headers:
| A | B | C | D | E |
|---|---|---|---|---|
| Title | YouTube URL | Category | Description | Order |

### 4.3 Add Sample Data (optional)

Example row:
| Title | YouTube URL | Category | Description | Order |
|---|---|---|---|---|
| Live at Oskar Blues | https://youtube.com/watch?v=abc123 | live | Full performance from Oct 2024 | 1 |

**Valid categories:** `live`, `music-video`, `interview`

### 4.4 Share Sheet with Service Account

1. Click "Share" button
2. Enter the **service account email**
3. Set permission to "Viewer"
4. Uncheck "Notify people"
5. Click "Share"

### 4.5 Get Spreadsheet ID

1. Look at the URL:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit
   ```
2. Copy the spreadsheet ID
3. Save this for environment variables

---

## Step 5: Neon Database Setup

### 5.1 Create Database

1. Log into [Neon](https://neon.tech)
2. Create new project: `kelso-kelly-music`
3. Region: Choose closest to your Vercel deployment
4. Click "Create Project"

### 5.2 Get Connection String

1. In the Neon dashboard, go to your project
2. Click "Connection Details"
3. Copy the **Postgres connection string**
4. Save this for environment variables

### 5.3 Run Database Migration

1. In the Neon dashboard, click "SQL Editor"
2. Copy the contents of `/db/schema.sql` from this project
3. Paste into the SQL Editor
4. Click "Run"
5. Verify all tables were created (events, photos, videos, sync_log, webhook_channels)

---

## Step 6: Environment Variables

### 6.1 Required Environment Variables

Create a `.env.local` file in the project root with these variables:

```env
# Neon Database
DATABASE_URL="postgresql://username:password@host.neon.tech/database?sslmode=require"

# Google Service Account (from the JSON file you downloaded)
GOOGLE_SERVICE_ACCOUNT_EMAIL="kelso-site-service@....iam.gserviceaccount.com"
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Google Resources
GOOGLE_CALENDAR_ID="abc123@group.calendar.google.com"
GOOGLE_DRIVE_PHOTOS_FOLDER_ID="folder-id-from-drive"
GOOGLE_VIDEOS_SHEET_ID="spreadsheet-id-from-sheets"

# Vercel Blob Storage (get from Vercel dashboard)
BLOB_READ_WRITE_TOKEN="vercel_blob_..."

# Site URL (for webhooks)
NEXT_PUBLIC_SITE_URL="https://your-site.vercel.app"

# Optional: Secrets for API security
REVALIDATE_SECRET="your-random-secret-here"
WEBHOOK_SETUP_SECRET="your-random-secret-here"
CRON_SECRET="your-random-secret-here"
```

### 6.2 Add to Vercel

1. Go to [Vercel Dashboard](https://vercel.com)
2. Select your project
3. Go to "Settings" → "Environment Variables"
4. Add all the variables above
5. Make sure to add them for all environments (Production, Preview, Development)

### 6.3 Get Vercel Blob Token

1. In Vercel Dashboard, go to "Storage"
2. Create a new Blob Store (if you don't have one)
3. Name: `kelso-kelly-photos`
4. Copy the `BLOB_READ_WRITE_TOKEN`
5. Add to environment variables

---

## Step 7: Initial Sync & Webhook Setup

### 7.1 Deploy to Vercel

1. Push your code to GitHub (if not already)
2. Deploy to Vercel
3. Wait for deployment to complete
4. Note the production URL

### 7.2 Run Initial Sync

Open your terminal and run these commands to populate the database:

```bash
# Sync calendar events
curl -X POST https://your-site.vercel.app/api/sync-calendar

# Sync photos (this may take a few minutes)
curl -X POST https://your-site.vercel.app/api/sync-photos

# Sync videos
curl -X POST https://your-site.vercel.app/api/sync-videos
```

Check the responses to ensure everything worked.

### 7.3 Set Up Webhooks

Run this command to initialize webhooks:

```bash
curl -X POST https://your-site.vercel.app/api/webhooks/setup \
  -H "Authorization: Bearer YOUR_WEBHOOK_SETUP_SECRET"
```

This sets up automatic syncing when:
- Dad creates/updates/deletes a calendar event
- Dad uploads photos to Google Drive
- (For videos, you'll need to manually trigger sync after updating the sheet)

### 7.4 Verify Everything Works

1. Visit your site's schedule page
2. Check that events appear
3. Visit the media page
4. Check that photos and videos appear

---

## Step 8: Using the System

### For You (Admin)

**Manual Syncs:**
You can trigger syncs anytime:
```bash
POST /api/sync-calendar
POST /api/sync-photos
POST /api/sync-videos
```

**Webhook Management:**
Webhooks auto-renew via cron job, but you can manually renew:
```bash
GET /api/cron/renew-webhooks
```

**Check Sync Logs:**
Connect to your Neon database and run:
```sql
SELECT * FROM sync_log ORDER BY synced_at DESC LIMIT 10;
```

### For Your Dad (Content Updates)

**Adding Events:**
1. Open Google Calendar
2. Select "Kelso Kelly Shows" calendar
3. Create new event with:
   - Title: "Live at Venue Name"
   - Date & Time: Event date/time
   - Location: "Venue Name, 123 Main St, City, CO 80123"
   - Description: Any details + ticket URL if available
4. Save
5. Site updates automatically within 1-2 minutes

**Adding Photos:**
1. Open Google Drive on iPad/computer
2. Navigate to `KelsoKellyMusic/photos`
3. Choose category folder (performance/backstage/press/promo)
4. Upload photos
5. Site updates automatically within 2-5 minutes

**Adding Videos:**
1. Upload video to YouTube (unlisted or public)
2. Copy the YouTube URL
3. Open "Kelso Kelly Videos" Google Sheet
4. Add new row with video info
5. Run manual sync or wait for you to sync

---

## Troubleshooting

### Events Not Syncing

1. Check service account has access to calendar
2. Check calendar ID is correct in env variables
3. Check webhook is active:
   ```sql
   SELECT * FROM webhook_channels WHERE resource_type = 'calendar';
   ```
4. Manually trigger sync: `POST /api/sync-calendar`

### Photos Not Syncing

1. Check service account has access to folder
2. Check folder ID is correct in env variables
3. Check Vercel Blob storage has space
4. Check webhook is active:
   ```sql
   SELECT * FROM webhook_channels WHERE resource_type = 'drive';
   ```
5. Manually trigger sync: `POST /api/sync-photos`

### Webhooks Expired

Webhooks auto-renew daily via cron job. If they expire:
```bash
POST /api/webhooks/setup
```

### Database Connection Issues

1. Check DATABASE_URL is correct
2. Check Neon database is running
3. Check IP allowlist in Neon (should allow all for serverless)

---

## Maintenance

### Regular Tasks

- **None!** The system is fully automated.
- Cron job renews webhooks daily
- Syncs happen automatically via webhooks

### Optional Tasks

- Check sync logs monthly to ensure everything is working
- Review Vercel Blob storage usage
- Review Neon database size

---

## Next Steps (Future Enhancements)

Optional improvements you could add later:

1. **Admin Dashboard**: Build a simple UI to trigger syncs and view logs
2. **Photo Re-ordering**: Add ability to manually order photos
3. **Video Categories**: Add filters for video categories
4. **Event Types**: Add back performance types (solo/duo/band) if needed
5. **Email Notifications**: Get notified when syncs fail

---

## Support

If you encounter issues:

1. Check sync logs in database
2. Check Vercel deployment logs
3. Check Google Cloud Console for API errors
4. Run manual syncs to test each component

---

## Summary of What We Built

✅ **Automated Content Management**
- Dad creates events in Google Calendar → auto-syncs to site
- Dad uploads photos to Google Drive → auto-optimizes and syncs to site
- Dad updates YouTube links in Google Sheet → syncs to site

✅ **Fast & Scalable**
- All data cached in Neon Postgres
- Images optimized and stored in Vercel Blob
- ISR with 60-second revalidation

✅ **Zero Maintenance**
- Webhooks auto-renew via cron
- Syncs trigger automatically
- No manual builds needed

✅ **Cost Effective**
- Neon: Free tier (512 MB)
- Vercel Pro: Already have ($20/mo, includes 1TB blob storage)
- Google Cloud: Free tier (well within limits)

**Total additional cost: $0!** 🎉
