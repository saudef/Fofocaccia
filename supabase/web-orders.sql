-- FoFocaccia Tracker ← website hand-off.
-- Run once in Supabase → SQL editor, on the same project as supabase/schema.sql.
--
-- Lets the public website (anonymous visitors, using the Tracker's public key) ADD a web order and nothing else:
-- only rows whose path starts with "weborders/", only a small JSON object, no reading, no updating, no deleting.
-- Signed-in users keep full access through the existing policies, and realtime already covers the docs table,
-- so a web order shows up in every open dashboard the moment the customer taps "Send order on WhatsApp".

drop policy if exists "website may add a web order" on public.docs;
create policy "website may add a web order" on public.docs
  for insert to anon
  with check (
    path like 'weborders/FF-%'                       -- the website's reference, e.g. weborders/FF-1108-K7QD
    and length(path) <= 40
    and jsonb_typeof(data) = 'object'
    and data ? 'ref' and data ? 'items'
    and (data->>'source') = 'website'
    and pg_column_size(data) < 16000                 -- a real order is about 1–2 KB
  );

-- The table trigger stores auth.uid() in updated_by; for anonymous inserts that is null, which the column allows.
-- To switch the hand-off off: drop policy "website may add a web order" on public.docs;
