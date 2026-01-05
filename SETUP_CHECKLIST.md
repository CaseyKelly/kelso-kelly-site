# Kelso Kelly Music - Complete Setup Checklist

This is your step-by-step checklist for setting up the Google Calendar + Google Drive integration.

---

## 🚀 Your Complete Setup Checklist

---

## Step 1: Google Cloud Setup (30-45 min)

### 1.1 Create Google Cloud Project
- [ ] Go to [Google Cloud Console](https://console.cloud.google.com)
- [ ] Click "Select a Project" → "New Project"
- [ ] Project name: `kelso-kelly-music`
- [ ] Click "Create"

### 1.2 Enable Required APIs
- [ ] In Cloud Console, go to "APIs & Services" → "Library"
- [ ] Search for and enable:
  - **Google Calendar API**
  - **Google Drive API**
  - **Google Sheets API**

### 1.3 Create Service Account
- [ ] Go to "IAM & Admin" → "Service Accounts"
- [ ] Click "Create Service Account"
- [ ] Name: `kelso-site-service`
- [ ] Description: `Service account for Kelso Kelly website`
- [ ] Click "Create and Continue" → Skip permissions → "Done"

### 1.4 Create Service Account Key
- [ ] Click on the service account you just created
- [ ] Go to "Keys" tab
- [ ] Click "Add Key" → "Create new key"
- [ ] Select "JSON" format
- [ ] Click "Create"
- [ ] **Save this JSON file securely!**

The JSON will look like:
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

**Save these values:**
- [ ] `client_email` → for `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- [ ] `private_key` → for `GOOGLE_PRIVATE_KEY`

---

## Step 2: Google Calendar Setup (10 min)

### 2.1 Create Calendar
- [ ] Go to [Google Calendar](https://calendar.google.com)
- [ ] Click "+" next to "Other calendars"
- [ ] Select "Create new calendar"
- [ ] Name: `Kelso Kelly Shows`
- [ ] Click "Create calendar"

### 2.2 Share Calendar with Service Account
- [ ] Find calendar in left sidebar
- [ ] Click three dots → "Settings and sharing"
- [ ] Scroll to "Share with specific people"
- [ ] Click "Add people"
- [ ] Enter the **service account email** (from JSON file)
- [ ] Set permission to **"Make changes to events"**
- [ ] Click "Send"

### 2.3 Get Calendar ID
- [ ] Still in calendar settings
- [ ] Scroll to "Integrate calendar"
- [ ] Copy the **Calendar ID** (looks like: `abc123@group.calendar.google.com`)
- [ ] Save for `GOOGLE_CALENDAR_ID`

---

## Step 3: Google Drive Setup (15 min)

### 3.1 Create Folder Structure
- [ ] Go to [Google Drive](https://drive.google.com)
- [ ] Create folder: `KelsoKellyMusic`
- [ ] Inside it, create folder: `photos`
- [ ] Inside `photos`, create these 4 folders:
  - [ ] `performance`
  - [ ] `backstage`
  - [ ] `press`
  - [ ] `promo`

Structure should be:
```
KelsoKellyMusic/
└── photos/
    ├── performance/
    ├── backstage/
    ├── press/
    └── promo/
```

### 3.2 Share Folder with Service Account
- [ ] Right-click `KelsoKellyMusic` folder
- [ ] Click "Share"
- [ ] Enter the **service account email**
- [ ] Set permission to **"Viewer"**
- [ ] Uncheck "Notify people"
- [ ] Click "Share"

### 3.3 Get Folder ID
- [ ] Open the `photos` folder
- [ ] Look at URL: `https://drive.google.com/drive/folders/FOLDER_ID_HERE`
- [ ] Copy the folder ID (the part after `/folders/`)
- [ ] Save for `GOOGLE_DRIVE_PHOTOS_FOLDER_ID`

---

## Step 4: Google Sheet for Videos (10 min)

### 4.1 Create Spreadsheet
- [ ] Go to [Google Sheets](https://sheets.google.com)
- [ ] Create new spreadsheet
- [ ] Name: `Kelso Kelly Videos`
- [ ] Rename first tab to: `Videos`

### 4.2 Set Up Headers
- [ ] In row 1, add these columns:

| A | B | C | D | E |
|---|---|---|---|---|
| Title | YouTube URL | Category | Description | Order |

### 4.3 Add Sample Data (optional)
Example:
| Title | YouTube URL | Category | Description | Order |
|---|---|---|---|---|
| Live at Oskar Blues | https://youtube.com/watch?v=abc123 | live | Full performance | 1 |

**Valid categories:** `live`, `music-video`, `interview`

### 4.4 Share Sheet with Service Account
- [ ] Click "Share" button
- [ ] Enter **service account email**
- [ ] Set permission to **"Viewer"**
- [ ] Uncheck "Notify people"
- [ ] Click "Share"

### 4.5 Get Spreadsheet ID
- [ ] Look at URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit`
- [ ] Copy spreadsheet ID
- [ ] Save for `GOOGLE_VIDEOS_SHEET_ID`

---

## Step 5: Neon Database Setup (10 min)

### 5.1 Create Database
- [ ] Log into [Neon](https://neon.tech)
- [ ] Create new project: `kelso-kelly-music`
- [ ] Choose region closest to Vercel deployment
- [ ] Click "Create Project"

### 5.2 Get Connection String
- [ ] In Neon dashboard, click "Connection Details"
- [ ] Copy **Postgres connection string**
- [ ] Save for `DATABASE_URL`

### 5.3 Run Database Migration
- [ ] In Neon dashboard, click "SQL Editor"
- [ ] Open your local file: `db/schema.sql`
- [ ] Copy entire contents
- [ ] Paste into SQL Editor
- [ ] Click "Run"
- [ ] Verify tables created: `events`, `photos`, `videos`, `sync_log`, `webhook_channels`

---

## Step 6: Vercel Setup (10 min)

### 6.1 Create Blob Store
- [ ] Go to Vercel Dashboard → Storage
- [ ] Create Blob Store: `kelso-kelly-photos`
- [ ] Copy `BLOB_READ_WRITE_TOKEN`

### 6.2 Connect GitHub Repo
- [ ] Go to Vercel Dashboard
- [ ] Click "Add New" → "Project"
- [ ] Import your GitHub repo: `CaseyKelly/kelso-kelly-site`
- [ ] Click "Deploy" (it will fail without env vars, that's OK)

---

## Step 7: Environment Variables (15 min)

### 7.1 Create `.env.local` File Locally

Create this file in your project root:

```env
# Neon Database
DATABASE_URL="postgresql://username:password@host.neon.tech/database?sslmode=require"

# Google Service Account (from JSON file)
GOOGLE_SERVICE_ACCOUNT_EMAIL="kelso-site-service@....iam.gserviceaccount.com"
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Google Resources
GOOGLE_CALENDAR_ID="abc123@group.calendar.google.com"
GOOGLE_DRIVE_PHOTOS_FOLDER_ID="folder-id-from-drive"
GOOGLE_VIDEOS_SHEET_ID="spreadsheet-id-from-sheets"

# Vercel Blob Storage
BLOB_READ_WRITE_TOKEN="vercel_blob_..."

# Site URL (update after deployment)
NEXT_PUBLIC_SITE_URL="https://your-site.vercel.app"

# Optional: Security secrets (generate random strings)
REVALIDATE_SECRET="your-random-secret-here"
WEBHOOK_SETUP_SECRET="your-random-secret-here"
CRON_SECRET="your-random-secret-here"
```

### 7.2 Add to Vercel
- [ ] Vercel Dashboard → Your Project → Settings → Environment Variables
- [ ] Add ALL variables from above
- [ ] Add for **all environments**: Production, Preview, Development

---

## Step 8: Initial Deployment & Testing (20 min)

### 8.1 Deploy
- [ ] Push any changes to GitHub (if needed)
- [ ] Vercel should auto-deploy
- [ ] Wait for deployment to complete
- [ ] Note your production URL

### 8.2 Update Site URL
- [ ] Update `NEXT_PUBLIC_SITE_URL` in Vercel env vars with your actual URL
- [ ] Redeploy

### 8.3 Run Initial Syncs

Open terminal and run:

```bash
# Replace with your actual Vercel URL

# Sync calendar events
curl -X POST https://your-site.vercel.app/api/sync-calendar

# Sync photos (may take a few minutes)
curl -X POST https://your-site.vercel.app/api/sync-photos

# Sync videos
curl -X POST https://your-site.vercel.app/api/sync-videos
```

### 8.4 Set Up Webhooks

```bash
curl -X POST https://your-site.vercel.app/api/webhooks/setup \
  -H "Authorization: Bearer YOUR_WEBHOOK_SETUP_SECRET"
```

### 8.5 Verify Site Works
- [ ] Visit your site
- [ ] Check schedule page (events should appear if you added any)
- [ ] Check media page (photos/videos should appear if you added any)
- [ ] Check all other pages load without errors

---

## Step 9: Test the Automated Workflow

### Test Events
- [ ] Create a test event in Google Calendar
- [ ] Wait 1-2 minutes
- [ ] Refresh your site's schedule page
- [ ] Event should appear!

### Test Photos
- [ ] Upload a test photo to one of the Drive folders
- [ ] Wait 2-5 minutes
- [ ] Refresh media page
- [ ] Photo should appear!

### Test Videos
- [ ] Add a YouTube link to the Google Sheet
- [ ] Run manual sync: `curl -X POST https://your-site.vercel.app/api/sync-videos`
- [ ] Refresh media page
- [ ] Video should appear!

---

## 📝 Summary of What You Need to Collect

| Item | Environment Variable | Where to Get It |
|------|---------------------|----------------|
| Database URL | `DATABASE_URL` | Neon Dashboard |
| Service Account Email | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | JSON key file |
| Service Account Key | `GOOGLE_PRIVATE_KEY` | JSON key file |
| Calendar ID | `GOOGLE_CALENDAR_ID` | Google Calendar settings |
| Photos Folder ID | `GOOGLE_DRIVE_PHOTOS_FOLDER_ID` | Google Drive URL |
| Videos Sheet ID | `GOOGLE_VIDEOS_SHEET_ID` | Google Sheets URL |
| Blob Token | `BLOB_READ_WRITE_TOKEN` | Vercel Dashboard |
| Site URL | `NEXT_PUBLIC_SITE_URL` | After Vercel deployment |

---

## 🎯 Quick Start (After Setup)

Once everything is configured, here's how your dad will use the system:

### Adding Events
1. Open Google Calendar
2. Create event in "Kelso Kelly Shows" calendar
3. Add title, date, time, location
4. Site updates automatically in 1-2 minutes

### Adding Photos
1. Open Google Drive on iPad
2. Navigate to KelsoKellyMusic/photos/[category]
3. Upload photos
4. Site updates automatically in 2-5 minutes

### Adding Videos
1. Upload video to YouTube
2. Copy YouTube URL
3. Add to "Kelso Kelly Videos" Google Sheet
4. Manually trigger sync (or you can set up automatic sync)

---

**Total estimated time: ~2 hours**

See `SETUP_GUIDE.md` for even more detailed instructions!
