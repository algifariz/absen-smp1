alter table public.records enable row level security;

create policy "public read" on public.records
for select using (true);

create policy "public write" on public.records
for insert with check (true);

create policy "public update" on public.records
for update using (true) with check (true);

create policy "public delete" on public.records
for delete using (true);
