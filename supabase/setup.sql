-- OrderTrack database setup (already applied to project pugkpvtdcnpwrvmtbamz as migration "ordertrack_init").
-- Safe to run again: everything is create-if-missing.
create table if not exists public.ot_docs (
  collection text not null,
  id         text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists ot_docs_collection_idx on public.ot_docs (collection);
alter table public.ot_docs replica identity full;
alter table public.ot_docs enable row level security;
grant select, insert, update, delete on public.ot_docs to anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ot_docs' and policyname = 'ot_docs_app_read') then
    create policy ot_docs_app_read on public.ot_docs for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ot_docs' and policyname = 'ot_docs_app_write') then
    create policy ot_docs_app_write on public.ot_docs for all to anon, authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ot_docs') then
    alter publication supabase_realtime add table public.ot_docs;
  end if;
end $$;
insert into storage.buckets (id, name, public) values ('ordertrack', 'ordertrack', true) on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'ot_files_read') then
    create policy ot_files_read on storage.objects for select to anon, authenticated using (bucket_id = 'ordertrack');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'ot_files_write') then
    create policy ot_files_write on storage.objects for insert to anon, authenticated with check (bucket_id = 'ordertrack');
  end if;
end $$;
