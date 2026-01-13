# Sistem Poin Kelas (Absensi SMP)

Aplikasi leaderboard, absensi barcode, dan manajemen poin siswa berbasis Next.js + Supabase.

## Fitur
- Leaderboard poin siswa (filter kelas)
- Panel admin untuk tambah/edit/hapus siswa
- Scan barcode (kamera) + input manual
- Kelola pelanggaran dengan penalti poin
- Download kartu siswa berisi barcode

## Prasyarat
- Node.js 18+
- Akun Supabase

## Setup Supabase
1) Buat project di Supabase.
2) Buka **SQL Editor** dan jalankan file `supabase/schema.sql`.
3) (Opsional) Jika ingin RLS aktif, jalankan file `supabase/rls.sql`.

## Env
Buat file `.env.local` di root proyek:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Install & Run
```
npm install
npm run dev
```

Akses di `http://localhost:3000`.

## Struktur Data
Semua data disimpan di tabel `records` dengan kolom `type`:
- `type = 'siswa'` untuk data siswa
- `type = 'pelanggaran'` untuk daftar pelanggaran

Kolom penting:
- siswa: `id`, `nama`, `kelas`, `poin`, `kehadiran`, `dibuat`, `barcode_id`, `absen_hari_ini`
- pelanggaran: `id`, `nama_pelanggaran`, `poin_pelanggaran`

## Catatan
- Barcode scanner butuh izin kamera di browser.
- Data tersortir otomatis oleh poin (siswa) dan poin pelanggaran.

## Troubleshooting
- Pastikan env Supabase benar (URL + anon key).
- Jika data tidak muncul, cek RLS policy atau matikan RLS untuk testing.
