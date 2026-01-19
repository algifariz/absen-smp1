"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type AbsensiLog = {
  id: string;
  tanggal: string;
  kelas: string | null;
};

type PelanggaranLog = {
  id: string;
  tanggal: string;
  kelas: string | null;
};

type SiswaRow = {
  id: string;
  nama: string;
  kelas: string;
  poin: number;
  kehadiran: number;
};

type DayPoint = { date: string; count: number };

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLastDates(days: number) {
  const list: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    list.push(formatDate(d));
  }
  return list;
}

function buildSeries(dates: string[], logs: { tanggal: string }[]) {
  const counts = new Map<string, number>();
  logs.forEach((row) => {
    counts.set(row.tanggal, (counts.get(row.tanggal) || 0) + 1);
  });
  return dates.map((date) => ({ date, count: counts.get(date) || 0 }));
}

function makeSparkPoints(data: DayPoint[], height: number) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const step = data.length > 1 ? 100 / (data.length - 1) : 100;
  return data
    .map((d, i) => {
      const x = i * step;
      const y = height - (d.count / max) * height;
      return `${x},${y}`;
    })
    .join(" ");
}

function BarChart({ title, data }: { title: string; data: DayPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="card dashboard-card">
      <div className="card__head">
        <div>
          <h3 className="card__title">{title}</h3>
          <p className="card__desc">7 hari terakhir</p>
        </div>
      </div>
      <div className="chart">
        {data.map((item) => (
          <div key={item.date} className="chart__col">
            <div
              className="chart__bar"
              style={{ height: `${Math.max(8, (item.count / max) * 100)}%` }}
              title={`${item.date}: ${item.count}`}
            />
            <div className="chart__label">{item.date.slice(5)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [absensiSeries, setAbsensiSeries] = useState<DayPoint[]>([]);
  const [pelanggaranSeries, setPelanggaranSeries] = useState<DayPoint[]>([]);
  const [topSiswa, setTopSiswa] = useState<SiswaRow[]>([]);
  const [hadirHariIni, setHadirHariIni] = useState(0);
  const [topKelasAbsensi, setTopKelasAbsensi] = useState<{ kelas: string; count: number }[]>([]);
  const [topKelasPelanggaran, setTopKelasPelanggaran] = useState<{ kelas: string; count: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const dates = useMemo(() => getLastDates(7), []);
  const today = dates[dates.length - 1];

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const { data: absensiLogs, error: absensiError } = await supabase
        .from("absensi_log")
        .select("id,tanggal,kelas")
        .gte("tanggal", dates[0])
        .lte("tanggal", dates[dates.length - 1]);
      if (absensiError) throw absensiError;

      const { data: pelanggaranLogs, error: pelanggaranError } = await supabase
        .from("pelanggaran_log")
        .select("id,tanggal,kelas")
        .gte("tanggal", dates[0])
        .lte("tanggal", dates[dates.length - 1]);
      if (pelanggaranError) throw pelanggaranError;

      const { data: siswaRows, error: siswaError } = await supabase
        .from("records")
        .select("id,nama,kelas,poin,kehadiran")
        .eq("type", "siswa")
        .order("poin", { ascending: false })
        .limit(5);
      if (siswaError) throw siswaError;

      const absensiSeriesData = buildSeries(dates, (absensiLogs as AbsensiLog[]) || []);
      const pelanggaranSeriesData = buildSeries(dates, (pelanggaranLogs as PelanggaranLog[]) || []);
      const kelasAbsensiMap = new Map<string, number>();
      const kelasPelanggaranMap = new Map<string, number>();

      (absensiLogs as AbsensiLog[] | null)?.forEach((row) => {
        if (!row.kelas) return;
        kelasAbsensiMap.set(row.kelas, (kelasAbsensiMap.get(row.kelas) || 0) + 1);
      });
      (pelanggaranLogs as PelanggaranLog[] | null)?.forEach((row) => {
        if (!row.kelas) return;
        kelasPelanggaranMap.set(row.kelas, (kelasPelanggaranMap.get(row.kelas) || 0) + 1);
      });

      setAbsensiSeries(absensiSeriesData);
      setPelanggaranSeries(pelanggaranSeriesData);
      setTopSiswa((siswaRows as SiswaRow[]) || []);
      setHadirHariIni(
        (absensiLogs as AbsensiLog[] | null)?.filter((row) => row.tanggal === today).length || 0,
      );
      setTopKelasAbsensi(
        Array.from(kelasAbsensiMap.entries())
          .map(([kelas, count]) => ({ kelas, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 4),
      );
      setTopKelasPelanggaran(
        Array.from(kelasPelanggaranMap.entries())
          .map(([kelas, count]) => ({ kelas, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 4),
      );
    } catch {
      setLoadError("Gagal memuat dashboard. Pastikan tabel log tersedia.");
      setAbsensiSeries([]);
      setPelanggaranSeries([]);
      setTopSiswa([]);
      setHadirHariIni(0);
      setTopKelasAbsensi([]);
      setTopKelasPelanggaran([]);
    } finally {
      setIsLoading(false);
    }
  }, [dates, today]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "absensi_log" }, fetchData)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pelanggaran_log" }, fetchData)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "records" }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  return (
    <div className="absensi-shell fade-in">
      <div className="glass-card rounded-2xl p-4 md:p-6 mb-4 md:mb-6 premium-shadow absensi-hero">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="font-black tracking-tight mb-2" style={{ fontSize: "2rem", color: "#0f172a" }}>
              Dashboard Realtime
            </h1>
            <p style={{ fontSize: "0.9rem", color: "#0f172a" }}>
              Ringkasan absensi, pelanggaran, dan siswa terbaik.
            </p>
          </div>
          <button className="btn btn--primary" type="button" onClick={fetchData} disabled={isLoading}>
            {isLoading ? "Memuat..." : "Refresh"}
          </button>
        </div>
      </div>

      {loadError ? <div className="glass-card rounded-2xl p-4 mb-4">{loadError}</div> : null}

      <div className="admin-grid dashboard-grid">
        <div className="card dashboard-card dashboard-card--metric">
          <div className="card__head">
            <div>
              <h3 className="card__title">Hadir Hari Ini</h3>
              <p className="card__desc">Total absensi hari ini</p>
            </div>
          </div>
          <div className="dashboard-metric">{hadirHariIni}</div>
        </div>

        <div className="card dashboard-card dashboard-card--metric">
          <div className="card__head">
            <div>
              <h3 className="card__title">Total Absensi</h3>
              <p className="card__desc">7 hari terakhir</p>
            </div>
          </div>
          <div className="dashboard-metric">
            {absensiSeries.reduce((sum, item) => sum + item.count, 0)}
          </div>
        </div>

        <div className="card dashboard-card dashboard-card--metric">
          <div className="card__head">
            <div>
              <h3 className="card__title">Total Pelanggaran</h3>
              <p className="card__desc">7 hari terakhir</p>
            </div>
          </div>
          <div className="dashboard-metric">
            {pelanggaranSeries.reduce((sum, item) => sum + item.count, 0)}
          </div>
        </div>

        <div className="card dashboard-card dashboard-card--metric">
          <div className="card__head">
            <div>
              <h3 className="card__title">Rata-rata Harian</h3>
              <p className="card__desc">Absensi vs Pelanggaran</p>
            </div>
          </div>
          <div className="dashboard-metric-row">
            <div>
              <div className="metric-label">Absensi</div>
              <div className="metric-value">
                {(absensiSeries.reduce((sum, item) => sum + item.count, 0) / 7).toFixed(1)}
              </div>
            </div>
            <div>
              <div className="metric-label">Pelanggaran</div>
              <div className="metric-value">
                {(pelanggaranSeries.reduce((sum, item) => sum + item.count, 0) / 7).toFixed(1)}
              </div>
            </div>
          </div>
        </div>

        <div className="card dashboard-card dashboard-card--wide">
          <div className="card__head">
            <div>
              <h3 className="card__title">Absensi & Pelanggaran</h3>
              <p className="card__desc">Perbandingan harian</p>
            </div>
          </div>
          <div className="combo-chart">
            {dates.map((date, idx) => {
              const absCount = absensiSeries[idx]?.count || 0;
              const pelCount = pelanggaranSeries[idx]?.count || 0;
              const max = Math.max(
                1,
                ...absensiSeries.map((d) => d.count),
                ...pelanggaranSeries.map((d) => d.count),
              );
              const absHeight = Math.max(6, (absCount / max) * 100);
              const pelHeight = Math.max(6, (pelCount / max) * 100);
              return (
                <div key={date} className="combo-chart__col">
                  <div className="combo-chart__bar combo-chart__bar--absen" style={{ height: `${absHeight}%` }} />
                  <div className="combo-chart__bar combo-chart__bar--pel" style={{ height: `${pelHeight}%` }} />
                  <div className="combo-chart__label">{date.slice(5)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card dashboard-card dashboard-card--wide">
          <div className="card__head">
            <div>
              <h3 className="card__title">Trend Absensi</h3>
              <p className="card__desc">Grafik garis 7 hari</p>
            </div>
          </div>
          <div className="sparkline">
            <svg viewBox="0 0 100 40" preserveAspectRatio="none">
              <polyline
                points={makeSparkPoints(absensiSeries, 36)}
                fill="none"
                stroke="#2563eb"
                strokeWidth="3"
              />
            </svg>
          </div>
        </div>

        <div className="card dashboard-card dashboard-card--wide">
          <div className="card__head">
            <div>
              <h3 className="card__title">Trend Pelanggaran</h3>
              <p className="card__desc">Grafik garis 7 hari</p>
            </div>
          </div>
          <div className="sparkline">
            <svg viewBox="0 0 100 40" preserveAspectRatio="none">
              <polyline
                points={makeSparkPoints(pelanggaranSeries, 36)}
                fill="none"
                stroke="#dc2626"
                strokeWidth="3"
              />
            </svg>
          </div>
        </div>

        <div className="card dashboard-card dashboard-card--wide">
          <div className="card__head">
            <div>
              <h3 className="card__title">Top 5 Poin</h3>
              <p className="card__desc">Siswa dengan poin tertinggi</p>
            </div>
          </div>
          <div className="list">
            {topSiswa.length === 0 ? (
              <div className="muted">Belum ada data siswa.</div>
            ) : (
              topSiswa.map((row, index) => (
                <div key={row.id} className="list__row">
                  <div>
                    <div className="list__title">
                      #{index + 1} {row.nama}
                    </div>
                    <div className="list__meta">{row.kelas}</div>
                  </div>
                  <span className="chip chip--green">{row.poin}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card dashboard-card dashboard-card--wide">
          <div className="card__head">
            <div>
              <h3 className="card__title">Top Kelas Absensi</h3>
              <p className="card__desc">7 hari terakhir</p>
            </div>
          </div>
          <div className="list">
            {topKelasAbsensi.length === 0 ? (
              <div className="muted">Belum ada data.</div>
            ) : (
              topKelasAbsensi.map((row) => (
                <div key={row.kelas} className="list__row">
                  <div className="list__title">{row.kelas}</div>
                  <span className="chip chip--green">{row.count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card dashboard-card dashboard-card--wide">
          <div className="card__head">
            <div>
              <h3 className="card__title">Top Kelas Pelanggaran</h3>
              <p className="card__desc">7 hari terakhir</p>
            </div>
          </div>
          <div className="list">
            {topKelasPelanggaran.length === 0 ? (
              <div className="muted">Belum ada data.</div>
            ) : (
              topKelasPelanggaran.map((row) => (
                <div key={row.kelas} className="list__row">
                  <div className="list__title">{row.kelas}</div>
                  <span className="chip chip--red">{row.count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <BarChart title="Absensi" data={absensiSeries} />
        <BarChart title="Pelanggaran" data={pelanggaranSeries} />
      </div>
    </div>
  );
}
