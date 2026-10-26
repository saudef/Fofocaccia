-- FoFocaccia Tracker — run this once in Supabase → SQL editor.
-- One table holds every document the page saves: settings, menu, recipes, orders, expenses, bill photos…
-- No accounts: anyone with the page link (which carries the public anon key) can read and write everything.

create table if not exists public.docs (
  path        text primary key,                       -- e.g. "config/settings", "orders/abc123", "bills/abc123"
  collection  text generated always as (split_part(path, '/', 1)) stored,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
create index if not exists docs_collection_idx on public.docs (collection);

alter table public.docs enable row level security;

drop policy if exists "link holders read everything" on public.docs;
create policy "link holders read everything" on public.docs
  for select to anon, authenticated using (true);

drop policy if exists "link holders insert" on public.docs;
create policy "link holders insert" on public.docs
  for insert to anon, authenticated with check (true);

drop policy if exists "link holders update" on public.docs;
create policy "link holders update" on public.docs
  for update to anon, authenticated using (true) with check (true);

drop policy if exists "link holders delete" on public.docs;
create policy "link holders delete" on public.docs
  for delete to anon, authenticated using (true);

-- keep updated_at fresh on every write
create or replace function public.docs_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs
  for each row execute function public.docs_touch();

-- live updates: every open browser sees changes the moment they are saved
alter publication supabase_realtime add table public.docs;
