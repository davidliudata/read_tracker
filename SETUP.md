# Supabase Setup

Run this SQL in your Supabase project (SQL Editor tab):

```sql
create table reading_sessions (
  id        bigint primary key generated always as identity,
  book      text    not null,
  date      text    not null,
  minutes   integer not null,
  created_at timestamptz default now()
);

-- Allow anyone with the anon key to read/write (shared family log)
alter table reading_sessions enable row level security;
create policy "Public read"   on reading_sessions for select using (true);
create policy "Public insert" on reading_sessions for insert with check (true);
create policy "Public delete" on reading_sessions for delete using (true);

-- Enable real-time so changes appear instantly on all devices
alter publication supabase_realtime add table reading_sessions;
```

Then:
1. Go to Settings → API in your Supabase project
2. Copy "Project URL" and "anon public" key
3. Paste them into `config.js`
4. Drag the `claudecode/` folder to netlify.com to publish
