"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type AbsensiLog = {
  id: string;
  siswa_id: string;
  nama: string;
  kelas: string;
  barcode_id: string;
  status_hari_ini?: string | null;
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
  status_hari_ini?: string | null;
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
  const [showAllPelanggaran, setShowAllPelanggaran] = useState(false);

  useEffect(() => {
    const start = startOfRange(range);
    setFromDate(formatDateInput(start));
    setToDate(formatDateInput(new Date()));
  }, [range]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      let absensiRows: AbsensiLog[] = [];
      let pelanggaranRows: PelanggaranLog[] = [];
      let absensiOk = true;
      let pelanggaranOk = true;

      const absensiResp = await supabase
        .from("absensi_log")
        .select("*")
        .gte("tanggal", fromDate)
        .lte("tanggal", toDate)
        .order("tanggal", { ascending: false });
      if (absensiResp.error) {
        absensiOk = false;
      } else {
        absensiRows = (absensiResp.data as AbsensiLog[]) || [];
      }

      const pelanggaranResp = await supabase
        .from("pelanggaran_siswa_log")
        .select("*")
        .gte("tanggal", fromDate)
        .lte("tanggal", toDate)
        .order("tanggal", { ascending: false });
      if (pelanggaranResp.error) {
        pelanggaranOk = false;
      } else {
        pelanggaranRows = (pelanggaranResp.data as PelanggaranLog[]) || [];
      }

      const rowsWithStatus = (absensiRows || []).filter((row) => row.status_hari_ini);
      const hasStatus = rowsWithStatus.length > 0;

      if (!absensiOk || !hasStatus) {
        const { data: siswaRows, error: siswaError } = await supabase
          .from("records")
          .select("id,nama,kelas,barcode_id,absen_hari_ini,status_hari_ini,created_at")
          .eq("type", "siswa")
          .gte("absen_hari_ini", fromDate)
          .lte("absen_hari_ini", toDate);
        if (!siswaError) {
          absensiRows = ((siswaRows as Array<Record<string, string | null>>) || []).map((row) => ({
            id: String(row.id),
            siswa_id: String(row.id),
            nama: String(row.nama || "-"),
            kelas: String(row.kelas || "-"),
            barcode_id: String(row.barcode_id || "-"),
            status_hari_ini: row.status_hari_ini || "hadir",
            tanggal: String(row.absen_hari_ini || ""),
            created_at: String(row.created_at || new Date().toISOString()),
          }));
        }
      }

      if (!pelanggaranOk || pelanggaranRows.length === 0) {
        const { data: pelanggaranAlt, error: pelanggaranAltError } = await supabase
          .from("pelanggaran_log")
          .select("*")
          .gte("tanggal", fromDate)
          .lte("tanggal", toDate)
          .order("tanggal", { ascending: false });
        if (!pelanggaranAltError) {
          pelanggaranRows = (pelanggaranAlt as PelanggaranLog[]) || [];
        }
      }

      setAbsensiData(absensiRows);
      setPelanggaranData(pelanggaranRows);
      if (!absensiOk || !pelanggaranOk) {
        setLoadError("Sebagian data log belum tersedia. Silakan periksa tabel log Supabase.");
      }
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

  const handleSyncPelanggaran = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const { data: pelanggaranMaster, error: pelanggaranError } = await supabase
        .from("records")
        .select("id,nama_pelanggaran,poin_pelanggaran,created_at")
        .eq("type", "pelanggaran")
        .gte("created_at", `${fromDate}T00:00:00.000Z`)
        .lte("created_at", `${toDate}T23:59:59.999Z`);
      if (pelanggaranError) throw pelanggaranError;

      if ((pelanggaranMaster || []).length > 0) {
        const inserts = (pelanggaranMaster || []).map((row) => ({
          siswa_id: row.id,
          nama: row.nama_pelanggaran || "-",
          kelas: "-",
          nama_pelanggaran: row.nama_pelanggaran || "-",
          poin_pelanggaran: row.poin_pelanggaran || 0,
          status_hari_ini: "-",
          tanggal: String(row.created_at || "").slice(0, 10),
          created_at: row.created_at || new Date().toISOString(),
        }));
        await supabase.from("pelanggaran_log").insert(inserts);
      }
      fetchData();
    } catch {
      setLoadError("Gagal sinkronisasi pelanggaran. Periksa data master.");
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

  const statusSummary = useMemo(() => {
    const summary = new Map<string, { nama: string; kelas: string; hadir: number; izin: number; sakit: number; alfa: number }>();
    filteredAbsensi.forEach((row) => {
      const key = row.siswa_id;
      if (!summary.has(key)) {
        summary.set(key, {
          nama: row.nama,
          kelas: row.kelas || "-",
          hadir: 0,
          izin: 0,
          sakit: 0,
          alfa: 0,
        });
      }
      const item = summary.get(key)!;
      const status = row.status_hari_ini || "hadir";
      if (status === "izin") item.izin += 1;
      else if (status === "sakit") item.sakit += 1;
      else if (status === "alfa") item.alfa += 1;
      else item.hadir += 1;
    });
    return Array.from(summary.values());
  }, [filteredAbsensi]);

  const siswaOptions = useMemo(() => {
    const names = new Set<string>();
    statusSummary.forEach((row) => {
      names.add(row.nama);
    });
    return Array.from(names).sort();
  }, [statusSummary]);

  const [selectedSiswa, setSelectedSiswa] = useState<string>("all");

  const filteredStatusSummary = useMemo(() => {
    if (selectedSiswa === "all") return statusSummary;
    return statusSummary.filter((row) => row.nama === selectedSiswa);
  }, [statusSummary, selectedSiswa]);

  useEffect(() => {
    setPageAbsensi(1);
    setPagePelanggaran(1);
    setShowAllPelanggaran(false);
  }, [fromDate, toDate, search, selectedKelas]);

  const absensiTotalPages = Math.max(1, Math.ceil(filteredAbsensi.length / pageSize));
  const pelanggaranTotalPages = Math.max(1, Math.ceil(filteredPelanggaran.length / pageSize));

  const absensiPageData = useMemo(() => {
    const start = (pageAbsensi - 1) * pageSize;
    return filteredAbsensi.slice(start, start + pageSize);
  }, [filteredAbsensi, pageAbsensi]);

  const pelanggaranPageData = useMemo(() => {
    if (showAllPelanggaran) return filteredPelanggaran;
    const start = (pagePelanggaran - 1) * pageSize;
    return filteredPelanggaran.slice(start, start + pageSize);
  }, [filteredPelanggaran, pagePelanggaran, showAllPelanggaran]);

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
            status: row.status_hari_ini || "-",
          }))
        : filteredPelanggaran.map((row) => ({
            tanggal: row.tanggal,
            waktu: new Date(row.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
            nama: row.nama,
            kelas: row.kelas,
            pelanggaran: row.nama_pelanggaran,
            status: row.status_hari_ini || "-",
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

  const handleDownloadRekapCsv = () => {
    const rows = filteredStatusSummary.map((row) => ({
      nama: row.nama,
      kelas: row.kelas,
      hadir: row.hadir,
      izin: row.izin,
      sakit: row.sakit,
      alfa: row.alfa,
      total: row.hadir + row.izin + row.sakit + row.alfa,
    }));
    const headers = Object.keys(rows[0] || {});
    const csv = toCsv(rows, headers);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rekap_status_${fromDate}_sampai_${toDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadRekapPdf = () => {
    const rows = filteredStatusSummary;
    const html = `
      <html>
        <head>
          <title>Rekap Status per Siswa</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #111827; }
            h1 { font-size: 18px; margin-bottom: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
            th { background: #f1f5f9; }
          </style>
        </head>
        <body>
          <h1>Rekap Status per Siswa (${fromDate} - ${toDate})</h1>
          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>Kelas</th>
                <th>Hadir</th>
                <th>Izin</th>
                <th>Sakit</th>
                <th>Alfa</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (row) => `
                <tr>
                  <td>${row.nama}</td>
                  <td>${row.kelas}</td>
                  <td>${row.hadir}</td>
                  <td>${row.izin}</td>
                  <td>${row.sakit}</td>
                  <td>${row.alfa}</td>
                  <td>${row.hadir + row.izin + row.sakit + row.alfa}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </body>
      </html>
    `;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="absensi-shell fade-in">
      <div className="glass-card rounded-2xl p-5 md:p-6 mb-6 premium-shadow absensi-hero">
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

      <article className="card card--full p-5 md:p-6">
        <div className="card__head">
          <div>
            <h2 className="card__title">Filter Laporan</h2>
            <p className="card__desc">Pilih rentang waktu dan cari nama siswa.</p>
          </div>
        </div>

        <div className="actions" style={{ gap: "12px" }}>
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

        <div className="two-col" style={{ gap: "12px" }}>
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

        <div className="actions" style={{ gap: "12px" }}>
          <button className="btn btn--primary" type="button" onClick={fetchData} disabled={isLoading}>
            {isLoading ? "Memuat..." : "Refresh"}
          </button>
          <button className="btn btn--ghost" type="button" onClick={handleSyncAbsensi} disabled={isLoading}>
            Sinkronisasi Absensi
          </button>
          <button className="btn btn--ghost" type="button" onClick={handleSyncPelanggaran} disabled={isLoading}>
            Sinkronisasi Pelanggaran
          </button>
        </div>

        {loadError ? <div className="muted">{loadError}</div> : null}
      </article>

      <div className="admin-grid" style={{ gap: "24px" }}>
        <article className="card p-5 md:p-6 report-card">
          <div className="card__head report-header">
            <div>
              <h3 className="card__title">Laporan Absensi</h3>
              <p className="card__desc">Data kehadiran siswa.</p>
            </div>
            <div className="actions report-actions">
              <button className="btn btn--primary btn--sm" type="button" onClick={() => handleDownload("absensi")}>
                Download CSV
              </button>
              <button className="btn btn--danger btn--sm" type="button" aria-disabled="true" disabled>
                Download PDF
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table table-auto table-compact table-no-stack report-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Waktu</th>
                  <th>Nama</th>
                  <th>Kelas</th>
                  <th>Barcode</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {absensiPageData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-empty">Tidak ada data.</td>
                  </tr>
                ) : (
                  absensiPageData.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td data-label="Tanggal">{row.tanggal}</td>
                      <td data-label="Waktu">
                        {new Date(row.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td data-label="Nama">{row.nama}</td>
                      <td data-label="Kelas">{row.kelas || "-"}</td>
                      <td data-label="Barcode">{row.barcode_id}</td>
                      <td data-label="Status">{row.status_hari_ini || "-"}</td>
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

        <article className="card p-5 md:p-6 report-card">
          <div className="card__head report-header">
            <div>
              <h3 className="card__title">Laporan Pelanggaran</h3>
              <p className="card__desc">Siswa yang terkena pelanggaran.</p>
            </div>
            <div className="actions report-actions">
              <button className="btn btn--primary btn--sm" type="button" onClick={() => handleDownload("pelanggaran")}>
                Download CSV
              </button>
              <button className="btn btn--danger btn--sm" type="button" aria-disabled="true" disabled>
                Download PDF
              </button>
              <button
                className="btn btn--ghost btn--sm"
                type="button"
                onClick={() => setShowAllPelanggaran((prev) => !prev)}
              >
                {showAllPelanggaran ? "Pagination" : "Tampilkan Semua"}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table table-auto table-compact table-no-stack report-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Waktu</th>
                  <th>Nama</th>
                  <th>Kelas</th>
                  <th>Pelanggaran</th>
                  <th>Status</th>
                  <th>Poin</th>
                </tr>
              </thead>
              <tbody>
                {pelanggaranPageData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="table-empty">
                      Tidak ada data. Catat pelanggaran dari halaman siswa agar muncul.
                    </td>
                  </tr>
                ) : (
                  pelanggaranPageData.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td data-label="Tanggal">{row.tanggal}</td>
                      <td data-label="Waktu">
                        {new Date(row.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td data-label="Nama">{row.nama}</td>
                      <td data-label="Kelas">{row.kelas || "-"}</td>
                      <td data-label="Pelanggaran">{row.nama_pelanggaran}</td>
                      <td data-label="Status">{row.status_hari_ini || "-"}</td>
                      <td data-label="Poin">{row.poin_pelanggaran}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!showAllPelanggaran && pelanggaranTotalPages > 1 ? (
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

        <article className="card p-5 md:p-6 report-card">
          <div className="card__head report-header">
            <div>
              <h3 className="card__title">Rekap Status per Siswa</h3>
              <p className="card__desc">Hadir, Izin, Sakit, Alfa</p>
            </div>
            <div className="field" style={{ minWidth: 180 }}>
              <label className="label" htmlFor="siswaFilter">Pilih Siswa</label>
              <select
                id="siswaFilter"
                className="input"
                value={selectedSiswa}
                onChange={(e) => setSelectedSiswa(e.target.value)}
              >
                <option value="all">Semua Siswa</option>
                {siswaOptions.map((nama) => (
                  <option key={nama} value={nama}>
                    {nama}
                  </option>
                ))}
              </select>
            </div>
            <div className="actions report-actions">
              <button className="btn btn--primary btn--sm" type="button" onClick={handleDownloadRekapCsv}>
                Download CSV
              </button>
              <button className="btn btn--danger btn--sm" type="button" onClick={handleDownloadRekapPdf}>
                Download PDF
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table table-auto table-no-stack table-compact-right report-table">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Kelas</th>
                  <th>Hadir</th>
                  <th>Izin</th>
                  <th>Sakit</th>
                  <th>Alfa</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {filteredStatusSummary.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="table-empty">Tidak ada data.</td>
                  </tr>
                ) : (
                  filteredStatusSummary.map((row) => (
                    <tr key={`${row.nama}-${row.kelas}`} className="hover:bg-gray-50">
                      <td data-label="Nama">{row.nama}</td>
                      <td data-label="Kelas">{row.kelas}</td>
                      <td data-label="Hadir">{row.hadir}</td>
                      <td data-label="Izin">{row.izin}</td>
                      <td data-label="Sakit">{row.sakit}</td>
                      <td data-label="Alfa">{row.alfa}</td>
                      <td data-label="Total">{row.hadir + row.izin + row.sakit + row.alfa}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </div>
  );
}
