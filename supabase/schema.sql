-- FoFocaccia Tracker — run this once in Supabase → SQL editor.
-- One table holds every document the page saves: settings, menu, recipes, orders, expenses, bill photos…
-- Any signed-in user can read and write everything; nobody else can read anything.

create table if not exists public.docs (
  path        text primary key,                       -- e.g. "config/settings", "orders/abc123", "bills/abc123"
  collection  text generated always as (split_part(path, '/', 1)) stored,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);
create index if not exists docs_collection_idx on public.docs (collection);

alter table public.docs enable row level security;

drop policy if exists "signed-in users read everything" on public.docs;
create policy "signed-in users read everything" on public.docs
  for select to authenticated using (true);

drop policy if exists "signed-in users insert" on public.docs;
create policy "signed-in users insert" on public.docs
  for insert to authenticated with check (true);

drop policy if exists "signed-in users update" on public.docs;
create policy "signed-in users update" on public.docs
  for update to authenticated using (true) with check (true);

drop policy if exists "signed-in users delete" on public.docs;
create policy "signed-in users delete" on public.docs
  for delete to authenticated using (true);

-- keep updated_at / updated_by fresh on every write
create or replace function public.docs_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs
  for each row execute function public.docs_touch();

-- live updates: every open browser sees changes the moment they are saved
alter publication supabase_realtime add table public.docs;
