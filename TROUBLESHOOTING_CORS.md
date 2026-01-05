# Fixing the CORS Error in Sanity Studio

## The Error You're Seeing:
```
CorsOriginError: CorsOriginError
at getCurrentUser (createAuthStore.ts:132:13)
```

This means Sanity Studio can't connect to your Sanity project. Here's how to fix it:

---

## Step 1: Verify Your .env.local File

Make sure your `.env.local` file in the project root has the correct format:

```env
NEXT_PUBLIC_SANITY_PROJECT_ID=abc12345
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_REVALIDATE_SECRET=your-random-secret-here
```

**Important:**
- ❌ NO quotes around values
- ❌ NO spaces around the `=` sign
- ❌ Don't use `your-project-id-here` - use your actual project ID
- ✅ Project ID should look like: `abc12345` or `xyz9876w`

### How to Get Your Project ID:

1. Go to https://www.sanity.io/manage
2. Click on your project
3. Copy the **Project ID** from the top of the page (looks like `abc12345`)

---

## Step 2: Add localhost to CORS Origins

Sanity needs permission to allow requests from localhost:

1. Go to https://www.sanity.io/manage
2. Select your project
3. Click **API** in the left sidebar
4. Scroll to **CORS Origins**
5. Click **Add CORS origin**
6. Add: `http://localhost:3000`
7. Check **Allow credentials**
8. Click **Save**

**Also add** (if you're using a different port):
- `http://localhost:3001`
- `http://localhost:4000`

---

## Step 3: Restart Your Dev Server

After updating `.env.local` or CORS settings:

```bash
# Stop the dev server (Ctrl+C)
npm run dev
```

Environment variables are only loaded when the server starts, so you MUST restart.

---

## Step 4: Clear Browser Cache

Sometimes the browser caches the error:

1. Open DevTools (F12)
2. Right-click the refresh button
3. Select **Empty Cache and Hard Reload**
4. Try visiting http://localhost:3000/studio again

---

## Step 5: Check Browser Console

Open your browser console (F12) and check if you see:

```
❌ Missing NEXT_PUBLIC_SANITY_PROJECT_ID in .env.local file
```

If you see this message, your `.env.local` file is not being read or has the wrong values.

---

## Quick Checklist:

- [ ] Created a Sanity project at https://sanity.io
- [ ] Copied the Project ID (8-12 character string)
- [ ] Created `.env.local` file in project root (next to `package.json`)
- [ ] Added `NEXT_PUBLIC_SANITY_PROJECT_ID=your-actual-id` (no quotes)
- [ ] Added `NEXT_PUBLIC_SANITY_DATASET=production`
- [ ] Added `http://localhost:3000` to CORS Origins in Sanity dashboard
- [ ] Restarted dev server with `npm run dev`
- [ ] Cleared browser cache

---

## Still Having Issues?

### Check the Terminal Output

When you run `npm run dev`, check for error messages about missing environment variables.

### Verify Environment Variables Are Loading

Add this to check if variables are loading:

```bash
# In a new terminal window, while dev server is running:
cd /Users/casey/workspace/kelso-kelly-music
echo $NEXT_PUBLIC_SANITY_PROJECT_ID
```

If it's empty, the `.env.local` file isn't being read properly.

### Common Mistakes:

1. **Wrong file location:** `.env.local` must be in `/Users/casey/workspace/kelso-kelly-music/` (same folder as `package.json`)

2. **Wrong file name:**
   - ✅ `.env.local` (correct)
   - ❌ `env.local` (missing the dot)
   - ❌ `.env` (wrong - Next.js looks for `.env.local` first)

3. **Quotes in .env.local:**
   ```env
   # ❌ WRONG:
   NEXT_PUBLIC_SANITY_PROJECT_ID="abc12345"
   
   # ✅ CORRECT:
   NEXT_PUBLIC_SANITY_PROJECT_ID=abc12345
   ```

4. **Using placeholder values:**
   - The default `.env.local` has `your-project-id-here`
   - You MUST replace this with your actual project ID

---

## If All Else Fails:

Run this diagnostic:

```bash
cd /Users/casey/workspace/kelso-kelly-music
cat .env.local
```

This will show your `.env.local` contents. Make sure:
- File exists
- Has your actual project ID (not `your-project-id-here`)
- No quotes or extra spaces

Then restart:
```bash
npm run dev
```

---

## After It Works:

You should see the Sanity Studio login screen at http://localhost:3000/studio

Sign in with the same account you used to create the Sanity project (Google/GitHub/email).
