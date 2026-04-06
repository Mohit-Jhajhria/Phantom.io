# PHANTOM REGIMENT — Deployment Guide

## Deploy to Render.com (Free)

### Step 1 — Upload to GitHub
1. Create a new repository on github.com (free account)
2. Upload these files:
   - server.js
   - package.json
   - public/index.html

### Step 2 — Deploy on Render
1. On Render dashboard, click "New Web Service"
2. Connect your GitHub repository
3. Settings:
   - **Name:** phantom-regiment
   - **Runtime:** Node
   - **Build Command:** npm install
   - **Start Command:** npm start
   - **Instance Type:** Free
4. Click "Create Web Service"
5. Wait 2-3 minutes for deploy

### Step 3 — Set Environment Variable
In Render → your service → Environment:
- Key: RENDER_EXTERNAL_URL
- Value: https://YOUR-SERVICE-NAME.onrender.com
  (shown in Render dashboard after deploy)

This enables the keep-alive ping so the server never sleeps.

### Step 4 — Play!
Open: https://YOUR-SERVICE-NAME.onrender.com
Share that URL with anyone — they press FIND MATCH, get paired automatically.

## Local Testing
```
npm install
npm start
```
Open http://localhost:3000 in TWO browser tabs.
Both press FIND MATCH — they pair instantly.
