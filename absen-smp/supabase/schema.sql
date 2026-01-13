create table if not exists public.records (
  id text primary key,
  type text not null,
  nama text,
  kelas text,
  poin integer default 0,
  kehadiran integer default 0,
  dibuat timestamptz,
  barcode_id text,
  absen_hari_ini text,
  nama_pelanggaran text,
  poin_pelanggaran integer,
  created_at timestamptz default now()
);

create index if not exists records_type_idx on public.records(type);
create index if not exists records_barcode_idx on public.records(barcode_id);
