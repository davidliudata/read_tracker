# Daily Activity Tracker

A lightweight web app to track daily reading, swimming, and walking sessions — with charts, streaks, badges, and optional family sharing via Supabase.

## Features

- **Log sessions** — book/activity name, date, duration (minutes)
- **Activity types** — Reading 📚, Swimming 🏊, Walking 🚶
- **Daily goal ring** — visual SVG ring that fills as you hit your goal
- **Streak tracking** — consecutive active days; warning banner if you haven't logged today
- **Badges** — 10 achievements (First Step, Week Warrior, Bookworm, All-Rounder, etc.)
- **Charts** — interactive area chart (progress over time) and stacked bar chart (monthly by day) via ApexCharts
- **Family sharing** — optional Supabase backend for real-time sync across devices
- **Works offline** — falls back to `localStorage` when Supabase is not configured

## Quick Start (local)

Just open `index.html` in any browser — no build step required. Data is saved in localStorage.

## Family Sharing (Supabase)

1. Create a free project at [supabase.com](https://supabase.com)
2. Run the SQL in `SETUP.md` to create the table and enable real-time
3. Copy your Project URL and anon key into `config.js`:

```js
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
```

4. Open the app — all family devices sharing the same credentials will sync in real-time.

See `SETUP.md` for the full SQL schema.

## Deployment

Deploy to [Netlify](https://netlify.com) (or any static host) by dragging the project folder into the Netlify dashboard. No server required.

## Files

| File | Description |
|------|-------------|
| `index.html` | App shell and layout |
| `app.js` | All logic: sessions, charts, badges, Supabase sync |
| `style.css` | Styling, animations, badge cards |
| `config.js` | Supabase credentials (edit this) |
| `SETUP.md` | Supabase SQL setup instructions |
