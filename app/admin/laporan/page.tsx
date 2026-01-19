"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type AbsensiLog = {
  id: string;
  siswa_id: string;
  nama: string;
  kelas: string;
  barcode_id: string;
  tanggal: string;
  created_at: string;
};

type PelanggaranLog = {
  id: string;
  siswa_id: string;
  nama: string;
  kelas: string;
  nama_pelanggaran: string;
  poin_pelanggaran: number;
  tanggal: string;
  created_at: string;
};

type RangeKey = "minggu" | "bulan" | "tahun";

function startOfRange(range: RangeKey) {
  const now = new Date();
  const start = new Date(now);
  if (range === "minggu") {
    const day = start.getDay();
    const diff = (day + 6) % 7;
    start.setDate(start.getDate() - diff);
  } else if (range === "bulan") {
    start.setDate(1);
  } else {
    start.setMonth(0, 1);
  }
  start.setHours(0, 0, 0, 0);
  return start;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toCsv(rows: Record<string, string | number | null>[], headers: string[]) {
  const escape = (value: string | number | null) => {
    const text = value === null ? "" : String(value);
    if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
      return `"${text.replace(/\"/g, "\"\"")}"`;
    }
    return text;
  };
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h] ?? "")).join(",")),
  ];
  return lines.join("\n");
}

export default function LaporanPage() {
  const [absensiData, setAbsensiData] = useState<AbsensiLog[]>([]);
  const [pelanggaranData, setPelanggaranData] = useState<PelanggaranLog[]>([]);
  const [range, setRange] = useState<RangeKey>("bulan");
  const [search, setSearch] = useState("");
  const [selectedKelas, setSelectedKelas] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(formatDateInput(startOfRange("bulan")));
  const [toDate, setToDate] = useState(formatDateInput(new Date()));
  const [pageAbsensi, setPageAbsensi] = useState(1);
  const [pagePelanggaran, setPagePelanggaran] = useState(1);
  const pageSize = 5;

  useEffect(() => {
    const start = startOfRange(range);
    setFromDate(formatDateInput(start));
    setToDate(formatDateInput(new Date()));
  }, [range]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const { data: absensiRows, error: absensiError } = await supabase
        .from("absensi_log")
        .select("*")
        .gte("tanggal", fromDate)
        .lte("tanggal", toDate)
        .order("tanggal", { ascending: false });
      if (absensiError) throw absensiError;

      const { data: pelanggaranRows, error: pelanggaranError } = await supabase
        .from("pelanggaran_log")
        .select("*")
        .gte("tanggal", fromDate)
        .lte("tanggal", toDate)
        .order("tanggal", { ascending: false });
      if (pelanggaranError) throw pelanggaranError;

      setAbsensiData((absensiRows as AbsensiLog[]) || []);
      setPelanggaranData((pelanggaranRows as PelanggaranLog[]) || []);
    } catch {
      setLoadError("Gagal memuat laporan. Pastikan tabel log tersedia.");
      setAbsensiData([]);
      setPelanggaranData([]);
    } finally {
      setIsLoading(false);
    }
  }, [fromDate, toDate]);

  const handleSyncAbsensi = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const { data: siswaRows, error: siswaError } = await supabase
        .from("records")
        .select("id,nama,kelas,barcode_id,absen_hari_ini")
        .eq("type", "siswa")
        .gte("absen_hari_ini", fromDate)
        .lte("absen_hari_ini", toDate);
      if (siswaError) throw siswaError;

      const { data: existingLogs, error: logError } = await supabase
        .from("absensi_log")
        .select("siswa_id,tanggal")
        .gte("tanggal", fromDate)
        .lte("tanggal", toDate);
      if (logError) throw logError;

      const existingSet = new Set(
        (existingLogs || []).map((row) => `${row.siswa_id}-${row.tanggal}`),
      );

      const inserts = (siswaRows || [])
        .filter((row: { absen_hari_ini: string | null }) => row.absen_hari_ini)
        .filter(
          (row: { id: string; absen_hari_ini: string | null }) =>
            !existingSet.has(`${row.id}-${row.absen_hari_ini}`),
        )
        .map((row: { id: string; nama: string; kelas: string; barcode_id: string; absen_hari_ini: string }) => ({
          siswa_id: row.id,
          nama: row.nama,
          kelas: row.kelas,
          barcode_id: row.barcode_id,
          tanggal: row.absen_hari_ini,
          created_at: new Date().toISOString(),
        }));

      if (inserts.length > 0) {
        const { error: insertError } = await supabase.from("absensi_log").insert(inserts);
        if (insertError) throw insertError;
      }

      fetchData();
    } catch {
      setLoadError("Gagal sinkronisasi absensi. Periksa data siswa.");
    } finally {
      setIsLoading(false);
    }
  }, [fetchData, fromDate, toDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredAbsensi = useMemo(() => {
    const query = search.trim().toLowerCase();
    let data = absensiData;
    if (selectedKelas !== "all") {
      data = data.filter((row) => row.kelas === selectedKelas);
    }
    if (!query) return data;
    return data.filter((row) =>
      [row.nama, row.kelas, row.barcode_id].some((field) => field?.toLowerCase().includes(query)),
    );
  }, [absensiData, search, selectedKelas]);

  const filteredPelanggaran = useMemo(() => {
    const query = search.trim().toLowerCase();
    let data = pelanggaranData;
    if (selectedKelas !== "all") {
      data = data.filter((row) => row.kelas === selectedKelas);
    }
    if (!query) return data;
    return data.filter((row) =>
      [row.nama, row.kelas, row.nama_pelanggaran].some((field) => field?.toLowerCase().includes(query)),
    );
  }, [pelanggaranData, search, selectedKelas]);

  useEffect(() => {
    setPageAbsensi(1);
    setPagePelanggaran(1);
  }, [fromDate, toDate, search, selectedKelas]);

  const absensiTotalPages = Math.max(1, Math.ceil(filteredAbsensi.length / pageSize));
  const pelanggaranTotalPages = Math.max(1, Math.ceil(filteredPelanggaran.length / pageSize));

  const absensiPageData = useMemo(() => {
    const start = (pageAbsensi - 1) * pageSize;
    return filteredAbsensi.slice(start, start + pageSize);
  }, [filteredAbsensi, pageAbsensi]);

  const pelanggaranPageData = useMemo(() => {
    const start = (pagePelanggaran - 1) * pageSize;
    return filteredPelanggaran.slice(start, start + pageSize);
  }, [filteredPelanggaran, pagePelanggaran]);

  const kelasOptions = useMemo(() => {
    const kelasSet = new Set<string>();
    absensiData.forEach((row) => {
      if (row.kelas) kelasSet.add(row.kelas);
    });
    pelanggaranData.forEach((row) => {
      if (row.kelas) kelasSet.add(row.kelas);
    });
    return Array.from(kelasSet).sort();
  }, [absensiData, pelanggaranData]);

  const handleDownload = (kind: "absensi" | "pelanggaran") => {
    const rows =
      kind === "absensi"
        ? filteredAbsensi.map((row) => ({
            tanggal: row.tanggal,
            waktu: new Date(row.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
            nama: row.nama,
            kelas: row.kelas,
            barcode_id: row.barcode_id,
          }))
        : filteredPelanggaran.map((row) => ({
            tanggal: row.tanggal,
            waktu: new Date(row.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
            nama: row.nama,
            kelas: row.kelas,
            pelanggaran: row.nama_pelanggaran,
            poin: row.poin_pelanggaran,
          }));
    const headers = Object.keys(rows[0] || {});
    const csv = toCsv(rows, headers);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `laporan_${kind}_${fromDate}_sampai_${toDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="absensi-shell fade-in">
      <div className="glass-card rounded-2xl p-4 md:p-6 mb-4 md:mb-6 premium-shadow absensi-hero">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="font-black tracking-tight mb-2" style={{ fontSize: "2rem", color: "#0f172a" }}>
              Laporan Absensi & Pelanggaran
            </h1>
            <p style={{ fontSize: "0.9rem", color: "#0f172a" }}>
              Cari data siswa, filter periode, dan unduh laporan.
            </p>
          </div>
        </div>
      </div>

      <article className="card card--full">
        <div className="card__head">
          <div>
            <h2 className="card__title">Filter Laporan</h2>
            <p className="card__desc">Pilih rentang waktu dan cari nama siswa.</p>
          </div>
        </div>

        <div className="actions">
          <button className={`segmented__btn ${range === "minggu" ? "is-active" : ""}`} onClick={() => setRange("minggu")}>
            1 Minggu
          </button>
          <button className={`segmented__btn ${range === "bulan" ? "is-active" : ""}`} onClick={() => setRange("bulan")}>
            1 Bulan
          </button>
          <button className={`segmented__btn ${range === "tahun" ? "is-active" : ""}`} onClick={() => setRange("tahun")}>
            1 Tahun
          </button>
        </div>

        <div className="two-col">
          <div className="field">
            <label className="label" htmlFor="fromDate">Dari</label>
            <input className="input" id="fromDate" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="toDate">Sampai</label>
            <input className="input" id="toDate" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="kelasFilter">Filter Kelas</label>
          <select
            id="kelasFilter"
            className="input"
            value={selectedKelas}
            onChange={(e) => setSelectedKelas(e.target.value)}
          >
            <option value="all">Semua Kelas</option>
            {kelasOptions.map((kelas) => (
              <option key={kelas} value={kelas}>
                {kelas}
              </option>
            ))}
          </select>
        </div>

        <div className="search">
          <span>🔍</span>
          <input
            className="search__input"
            placeholder="Cari nama/kelas/barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="actions">
          <button className="btn btn--primary" type="button" onClick={fetchData} disabled={isLoading}>
            {isLoading ? "Memuat..." : "Refresh"}
          </button>
          <button className="btn btn--ghost" type="button" onClick={handleSyncAbsensi} disabled={isLoading}>
            Sinkronisasi Absensi
          </button>
        </div>

        {loadError ? <div className="muted">{loadError}</div> : null}
      </article>

      <div className="admin-grid">
        <article className="card">
          <div className="card__head">
            <div>
              <h3 className="card__title">Laporan Absensi</h3>
              <p className="card__desc">Data kehadiran siswa.</p>
            </div>
            <button className="btn btn--primary btn--sm" type="button" onClick={() => handleDownload("absensi")}>
              Download CSV
            </button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Waktu</th>
                  <th>Nama</th>
                  <th>Kelas</th>
                  <th>Barcode</th>
                </tr>
              </thead>
              <tbody>
                {absensiPageData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="table-empty">Tidak ada data.</td>
                  </tr>
                ) : (
                  absensiPageData.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Tanggal">{row.tanggal}</td>
                      <td data-label="Waktu">
                        {new Date(row.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td data-label="Nama">{row.nama}</td>
                      <td data-label="Kelas">{row.kelas || "-"}</td>
                      <td data-label="Barcode">{row.barcode_id}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {absensiTotalPages > 1 ? (
            <div className="segmented" aria-label="Pagination absensi">
              {Array.from({ length: absensiTotalPages }, (_, idx) => {
                const page = idx + 1;
                return (
                  <button
                    key={page}
                    className={`segmented__btn ${pageAbsensi === page ? "is-active" : ""}`}
                    type="button"
                    onClick={() => setPageAbsensi(page)}
                  >
                    {page}
                  </button>
                );
              })}
            </div>
          ) : null}
        </article>

        <article className="card">
          <div className="card__head">
            <div>
              <h3 className="card__title">Laporan Pelanggaran</h3>
              <p className="card__desc">Siswa yang terkena pelanggaran.</p>
            </div>
            <button className="btn btn--danger btn--sm" type="button" onClick={() => handleDownload("pelanggaran")}>
              Download CSV
            </button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Waktu</th>
                  <th>Nama</th>
                  <th>Kelas</th>
                  <th>Pelanggaran</th>
                  <th>Poin</th>
                </tr>
              </thead>
              <tbody>
                {pelanggaranPageData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-empty">
                      Tidak ada data. Catat pelanggaran dari halaman siswa agar muncul.
                    </td>
                  </tr>
                ) : (
                  pelanggaranPageData.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Tanggal">{row.tanggal}</td>
                      <td data-label="Waktu">
                        {new Date(row.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td data-label="Nama">{row.nama}</td>
                      <td data-label="Kelas">{row.kelas || "-"}</td>
                      <td data-label="Pelanggaran">{row.nama_pelanggaran}</td>
                      <td data-label="Poin">{row.poin_pelanggaran}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {pelanggaranTotalPages > 1 ? (
            <div className="segmented" aria-label="Pagination pelanggaran">
              {Array.from({ length: pelanggaranTotalPages }, (_, idx) => {
                const page = idx + 1;
                return (
                  <button
                    key={page}
                    className={`segmented__btn ${pagePelanggaran === page ? "is-active" : ""}`}
                    type="button"
                    onClick={() => setPagePelanggaran(page)}
                  >
                    {page}
                  </button>
                );
              })}
            </div>
          ) : null}
        </article>
      </div>
    </div>
  );
}
