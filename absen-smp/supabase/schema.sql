create table if not exists public.records (
  id text primary key,
  type text not null,
  nama text,
  kelas text,
  poin integer default 0,
  kehadiran integer default 0,
  dibuat timestamptz,
  barcode_id text,
  absen_hari_ini date,
  nama_pelanggaran text,
  poin_pelanggaran integer,
  created_at timestamptz default now(),
  constraint records_type_check check (type in ('siswa', 'pelanggaran')),
  constraint records_poin_check check (poin >= 0),
  constraint records_kehadiran_check check (kehadiran >= 0),
  constraint records_pelanggaran_check check (poin_pelanggaran is null or poin_pelanggaran <= 0)
);

create index if not exists records_type_idx on public.records(type);
create index if not exists records_barcode_idx on public.records(barcode_id);
create unique index if not exists records_barcode_unique_idx on public.records(barcode_id) where barcode_id is not null;
