"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

type SiswaRecord = {
  id: string;
  type: "siswa";
  nama: string;
  kelas: string;
  poin: number;
  kehadiran: number;
  dibuat: string;
  barcode_id: string;
  absen_hari_ini: string | null;
  status_hari_ini?: "hadir" | "izin" | "sakit" | "alfa" | null;
  created_at: string;
};

type ConfigState = {
  background_color: string;
  card_color: string;
  text_color: string;
  primary_action: string;
  secondary_action: string;
  font_family: string;
  font_size: number;
  judul_leaderboard: string;
  judul_admin: string;
  tombol_admin: string;
  tombol_kembali: string;
  tombol_simpan: string;
};

type AttendanceSummary = {
  hadir: number;
  izin: number;
  sakit: number;
  alfa: number;
  pelanggaran: number;
};

const defaultConfig: ConfigState = {
  background_color: "#f8fafc",
  card_color: "#ffffff",
  text_color: "#0f172a",
  primary_action: "#2563eb",
  secondary_action: "#64748b",
  font_family: "Inter",
  font_size: 16,
  judul_leaderboard: "\u{1F3C6} Leaderboard Kelas",
  judul_admin: "\u{1F512} Panel Admin",
  tombol_admin: "Mode Admin",
  tombol_kembali: "\u{2B05}\u{FE0F} Kembali",
  tombol_simpan: "Simpan Siswa",
};

export default function Home() {
  const [config] = useState<ConfigState>(defaultConfig);
  const [selectedKelas, setSelectedKelas] = useState<string>("all");
  const [siswaData, setSiswaData] = useState<SiswaRecord[]>([]);

  // Barcode Modal State
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [barcodeTarget, setBarcodeTarget] = useState<SiswaRecord | null>(null);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceSummary>>({});

  const [notif, setNotif] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  const notifTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const kelasList = useMemo(() => {
    const kelasSet = new Set(siswaData.map((s) => s.kelas).filter(Boolean));
    return Array.from(kelasSet).sort();
  }, [siswaData]);

  const filteredSiswa = useMemo(() => {
    if (selectedKelas === "all") return siswaData;
    return siswaData.filter((s) => s.kelas === selectedKelas);
  }, [selectedKelas, siswaData]);

  const totalSiswa = filteredSiswa.length;
  const totalPoin = filteredSiswa.reduce((sum, s) => sum + s.poin, 0);
  const totalSiswaLabel = isLoading ? "-" : totalSiswa.toString();
  const totalPoinLabel = isLoading ? "-" : totalPoin.toString();

  useEffect(() => {
    let isActive = true;
    const fetchAll = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const { data: siswaRows, error: siswaError } = await supabase
          .from("records")
          .select("*")
          .eq("type", "siswa")
          .order("poin", { ascending: false });
        if (siswaError) throw siswaError;

        if (!isActive) return;
        setSiswaData((siswaRows as SiswaRecord[]) || []);
      } catch {
        if (!isActive) return;
        setLoadError("Gagal memuat data. Periksa koneksi dan konfigurasi Supabase.");
        setSiswaData([]);
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    fetchAll();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) setSession(data.session);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, sessionState) => {
      setSession(sessionState);
    });
    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  useEffect(() => {
    if (!notif) return;
    if (notifTimeoutRef.current) clearTimeout(notifTimeoutRef.current);
    notifTimeoutRef.current = setTimeout(() => {
      setNotif(null);
    }, 3000);
    return () => {
      if (notifTimeoutRef.current) clearTimeout(notifTimeoutRef.current);
    };
  }, [notif]);

  useEffect(() => {
    let isActive = true;
    const fetchAttendanceSummary = async () => {
      if (siswaData.length === 0) {
        if (isActive) setAttendanceMap({});
        return;
      }
      const ids = siswaData.map((row) => row.id);
      const baseMap: Record<string, AttendanceSummary> = {};
      ids.forEach((id) => {
        baseMap[id] = { hadir: 0, izin: 0, sakit: 0, alfa: 0, pelanggaran: 0 };
      });

      const { data: absensiRows, error: absensiError } = await supabase
        .from("absensi_log")
        .select("siswa_id,status_hari_ini")
        .in("siswa_id", ids);
      if (!absensiError && absensiRows && absensiRows.length > 0) {
        (absensiRows as Array<{ siswa_id: string; status_hari_ini: string | null }>).forEach((row) => {
          const summary = baseMap[row.siswa_id];
          if (!summary) return;
          if (row.status_hari_ini === "hadir") summary.hadir += 1;
          if (row.status_hari_ini === "izin") summary.izin += 1;
          if (row.status_hari_ini === "sakit") summary.sakit += 1;
          if (row.status_hari_ini === "alfa") summary.alfa += 1;
        });
      } else {
        const { data: siswaFallback, error: siswaFallbackError } = await supabase
          .from("records")
          .select("id,kehadiran,status_hari_ini,absen_hari_ini")
          .eq("type", "siswa")
          .in("id", ids);
        if (!siswaFallbackError && siswaFallback) {
          (siswaFallback as Array<{ id: string; kehadiran: number; status_hari_ini: string | null; absen_hari_ini: string | null }>).forEach((row) => {
            const summary = baseMap[row.id];
            if (!summary) return;
            summary.hadir = Math.max(0, Number(row.kehadiran) || 0);
            if (row.absen_hari_ini && row.status_hari_ini && row.status_hari_ini !== "hadir") {
              if (row.status_hari_ini === "izin") summary.izin += 1;
              if (row.status_hari_ini === "sakit") summary.sakit += 1;
              if (row.status_hari_ini === "alfa") summary.alfa += 1;
            }
          });
        }
      }

      const { data: pelanggaranRows, error: pelanggaranError } = await supabase
        .from("pelanggaran_siswa_log")
        .select("siswa_id")
        .in("siswa_id", ids);
      if (!pelanggaranError && pelanggaranRows && pelanggaranRows.length > 0) {
        (pelanggaranRows as Array<{ siswa_id: string }>).forEach((row) => {
          const summary = baseMap[row.siswa_id];
          if (!summary) return;
          summary.pelanggaran += 1;
        });
      } else {
        const { data: pelanggaranFallback, error: pelanggaranFallbackError } = await supabase
          .from("pelanggaran_log")
          .select("siswa_id")
          .in("siswa_id", ids);
        if (!pelanggaranFallbackError && pelanggaranFallback) {
          (pelanggaranFallback as Array<{ siswa_id: string }>).forEach((row) => {
            const summary = baseMap[row.siswa_id];
            if (!summary) return;
            summary.pelanggaran += 1;
          });
        }
      }

      if (isActive) setAttendanceMap(baseMap);
    };

    fetchAttendanceSummary();
    return () => {
      isActive = false;
    };
  }, [siswaData]);

  const showNotif = useCallback((message: string) => {
    setNotif(message);
  }, []);

  const refreshData = useCallback(async () => {
    setLoadError(null);
    try {
      const { data: siswaRows, error: siswaError } = await supabase
        .from("records")
        .select("*")
        .eq("type", "siswa")
        .order("poin", { ascending: false });
      if (siswaError) throw siswaError;

      setSiswaData((siswaRows as SiswaRecord[]) || []);
    } catch {
      setLoadError("Gagal memuat data. Periksa koneksi dan konfigurasi Supabase.");
      showNotif("\u{274C} Gagal memuat data terbaru");
    }
  }, [showNotif]);


  const textColor = config.text_color || defaultConfig.text_color;
  const primaryColor = config.primary_action || defaultConfig.primary_action;
  const baseSize = config.font_size || defaultConfig.font_size;

  const selectedSummary = barcodeTarget ? attendanceMap[barcodeTarget.id] : undefined;

  return (
    <div className="min-h-full w-full">
      <div
        className="gradient-bg min-h-full"
        style={{ backgroundColor: config.background_color || defaultConfig.background_color }}
      >
        <div
          id="app"
          className="max-w-7xl mx-auto p-4 md:p-8 fade-in relative z-10"
          style={{ fontSize: `${baseSize}px`, fontFamily: `${config.font_family}, sans-serif` }}
        >
          {loadError ? (
            <div className="glass-card rounded-2xl p-4 md:p-6 mb-4 md:mb-6 premium-shadow">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <p className="font-semibold" style={{ color: textColor, fontSize: `${baseSize}px` }}>
                    {"\u{26A0}\u{FE0F}"} {loadError}
                  </p>
                  <p style={{ color: "#64748b", fontSize: `${baseSize * 0.85}px` }}>
                    Coba muat ulang setelah memastikan env Supabase benar.
                  </p>
                </div>
                <button
                  className="luxury-button px-5 py-2.5 rounded-xl font-semibold"
                  style={{ background: primaryColor, color: "white", fontSize: `${baseSize * 0.9}px` }}
                  onClick={() => refreshData()}
                >
                  Muat Ulang
                </button>
              </div>
            </div>
          ) : null}

          {isLoading ? (
            <div className="glass-card rounded-2xl p-4 md:p-6 mb-4 md:mb-6 premium-shadow">
              <div className="flex items-center gap-3">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ background: primaryColor, animation: "pulse 1.5s ease-in-out infinite" }}
                />
                <p style={{ color: textColor, fontSize: `${baseSize * 0.95}px`, fontWeight: 600 }}>
                  Memuat data siswa...
                </p>
              </div>
            </div>
          ) : null}


            <>
              <div className="glass-card rounded-2xl p-4 md:p-8 mb-4 md:mb-8 premium-shadow">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <h1
                      className="font-bold tracking-tight mb-2"
                      style={{ fontSize: `${baseSize * 1.8}px`, color: textColor }}
                    >
                      {config.judul_leaderboard || defaultConfig.judul_leaderboard}
                    </h1>
                    <p style={{ fontSize: `${baseSize * 0.85}px`, color: "#64748b" }}>
                      Sistem Poin & Prestasi Siswa
                    </p>
                  </div>
                  {session ? (
                    <button
                      className="luxury-button admin-cta inline-flex items-center justify-center gap-2"
                      style={{ background: primaryColor, color: "white", fontSize: `${baseSize * 0.9}px` }}
                      type="button"
                      onClick={handleLogout}
                    >
                      <span>{"\u{1F512}"}</span>
                      <span>Logout</span>
                    </button>
                  ) : (
                    <Link
                      href="/login"
                      className="luxury-button admin-cta inline-flex items-center justify-center gap-2"
                      style={{ background: primaryColor, color: "white", fontSize: `${baseSize * 0.9}px` }}
                    >
                      <span>{"\u{1F512}"}</span>
                      <span>Login</span>
                    </Link>
                  )}
                </div>
              </div>

              {kelasList.length > 0 && !isLoading ? (
                <div className="glass-card rounded-2xl p-4 md:p-6 mb-4 md:mb-8 premium-shadow">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
                    <label className="font-semibold" style={{ fontSize: `${baseSize * 0.9}px`, color: textColor }}>
                      Filter Kelas:
                    </label>
                    <button
                      className={`btn-filter-kelas luxury-button px-4 py-2 rounded-xl font-semibold ${
                        selectedKelas === "all" ? "opacity-100" : "opacity-50"
                      }`}
                      style={{
                        background: selectedKelas === "all" ? primaryColor : "#e2e8f0",
                        color: selectedKelas === "all" ? "white" : textColor,
                        fontSize: `${baseSize * 0.85}px`,
                      }}
                      onClick={() => setSelectedKelas("all")}
                    >
                      Semua Kelas ({siswaData.length})
                    </button>
                    {kelasList.map((kelas) => {
                      const count = siswaData.filter((s) => s.kelas === kelas).length;
                      return (
                        <button
                          key={kelas}
                          className={`btn-filter-kelas luxury-button px-4 py-2 rounded-xl font-semibold ${
                            selectedKelas === kelas ? "opacity-100" : "opacity-50"
                          }`}
                          style={{
                            background: selectedKelas === kelas ? primaryColor : "#e2e8f0",
                            color: selectedKelas === kelas ? "white" : textColor,
                            fontSize: `${baseSize * 0.85}px`,
                          }}
                          onClick={() => setSelectedKelas(kelas)}
                        >
                          {kelas} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 mb-4 md:mb-8">
                <div className="stat-card p-4 md:p-6 rounded-2xl premium-shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <div
                        style={{
                          fontSize: `${baseSize * 0.8}px`,
                          color: "#64748b",
                          fontWeight: 600,
                          marginBottom: 8,
                        }}
                      >
                        Total Siswa{selectedKelas !== "all" ? ` - ${selectedKelas}` : ""}
                      </div>
                      <div className="font-bold" style={{ fontSize: `${baseSize * 2}px`, color: primaryColor }}>
                        {totalSiswaLabel}
                      </div>
                    </div>
                    <div style={{ fontSize: 36, opacity: 0.2 }}>{"\u{1F465}"}</div>
                  </div>
                </div>
                <div className="stat-card p-4 md:p-6 rounded-2xl premium-shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <div
                        style={{
                          fontSize: `${baseSize * 0.8}px`,
                          color: "#64748b",
                          fontWeight: 600,
                          marginBottom: 8,
                        }}
                      >
                        Total Poin{selectedKelas !== "all" ? ` - ${selectedKelas}` : ""}
                      </div>
                      <div className="font-bold" style={{ fontSize: `${baseSize * 2}px`, color: primaryColor }}>
                        {totalPoinLabel}
                      </div>
                    </div>
                    <div style={{ fontSize: 36, opacity: 0.2 }}>{"\u{2B50}"}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {isLoading ? (
                  <div className="glass-card rounded-2xl text-center py-16 md:py-24 premium-shadow col-span-full">
                    <div style={{ fontSize: `${baseSize * 3.5}px`, marginBottom: 16, opacity: 0.2 }}>{"\u{23F3}"}</div>
                    <p style={{ fontSize: `${baseSize}px`, color: "#94a3b8", fontWeight: 500 }}>
                      Memuat data siswa...
                    </p>
                  </div>
                ) : filteredSiswa.length === 0 ? (
                  <div className="glass-card rounded-2xl text-center py-16 md:py-24 premium-shadow col-span-full">
                    <div style={{ fontSize: `${baseSize * 4}px`, marginBottom: 16, opacity: 0.15 }}>{"\u{1F4ED}"}</div>
                    <p style={{ fontSize: `${baseSize}px`, color: "#94a3b8", fontWeight: 500 }}>
                      Belum ada data siswa{selectedKelas !== "all" ? ` di kelas ${selectedKelas}` : ""}
                    </p>
                  </div>
                ) : (
                  filteredSiswa.map((siswa, index) => {
                    const summary = attendanceMap[siswa.id] || { hadir: 0, izin: 0, sakit: 0, alfa: 0, pelanggaran: 0 };
                    return (
                    <div
                      key={siswa.id}
                      className="glass-card leaderboard-card premium-shadow cursor-pointer hover:scale-[1.02] transition-transform"
                      onClick={() => {
                        setBarcodeTarget(siswa);
                        setBarcodeModalOpen(true);
                      }}
                    >
                      <div className="leaderboard-row">
                        <div className="leaderboard-rank">
                          <div className="leaderboard-medal" data-rank={index + 1}>
                            {index + 1}
                          </div>
                        </div>
                        <div className="leaderboard-info">
                          <div className="leaderboard-name" style={{ fontSize: `${baseSize * 1.05}px`, color: textColor }}>
                            {siswa.nama}
                          </div>
                          <div className="leaderboard-tags">
                            {siswa.kelas ? (
                              <span className="leaderboard-tag leaderboard-tag--kelas">
                                {"\u{1F3EB}"} {siswa.kelas}
                              </span>
                            ) : null}
                            <span className="leaderboard-tag leaderboard-tag--hadir">
                              {"\u{2705}"} {siswa.kehadiran}
                            </span>
                            <span className="leaderboard-tag leaderboard-tag--hadir">
                              {"\u{26A0}\u{FE0F}"} {summary.alfa}
                            </span>
                            <span className="leaderboard-tag leaderboard-tag--hadir">
                              {"\u{26A1}"} {summary.pelanggaran}
                            </span>
                          </div>
                        </div>
                        <div
                          className="leaderboard-score"
                          style={{ background: primaryColor }}
                        >
                          <span className="leaderboard-score__value">{siswa.poin}</span>
                          <span className="leaderboard-score__icon">{"\u{2B50}"}</span>
                        </div>
                      </div>
                    </div>
                  );
                  })
                )}
              </div>
            </>
        </div>
      </div>

      {barcodeModalOpen && barcodeTarget ? (
        <div className="modal-overlay" style={{ animation: "fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1)" }}>
          <div
            className="w-full mx-4"
            style={{
              maxWidth: 360,
              width: "82vw",
              animation: "fadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            <div className="relative" style={{ perspective: 1000 }}>
              <div
                className="relative rounded-3xl shadow-2xl overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor} 0%, #1e40af 100%)`,
                  width: "100%",
                  maxWidth: 360,
                  margin: "0 auto",
                  transformStyle: "preserve-3d",
                  animation: "fadeIn 0.6s ease",
                }}
              >
                <div
                  className="relative p-4 md:p-5"
                  style={{
                    background: "linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.05))",
                    borderBottom: "2px solid rgba(255, 255, 255, 0.2)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(255, 255, 255, 0.2)", backdropFilter: "blur(10px)" }}>
                        <span style={{ fontSize: `${baseSize * 2}px` }}>{"\u{1F4CB}"}</span>
                      </div>
                      <div>
                        <h3 className="font-black" style={{ fontSize: `${baseSize * 1.2}px`, color: "white", letterSpacing: 1, textTransform: "uppercase" }}>
                          Rekap Kehadiran
                        </h3>
                        <p style={{ fontSize: `${baseSize * 0.85}px`, color: "rgba(255, 255, 255, 0.8)" }}>{barcodeTarget.kelas || "-"}</p>
                      </div>
                    </div>
                    <div
                      className="w-20 h-20 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(255, 255, 255, 0.2)", border: "2px solid rgba(255, 255, 255, 0.4)", backdropFilter: "blur(10px)" }}
                    >
                      <span style={{ fontSize: `${baseSize * 2}px` }} suppressHydrationWarning>
                        {"\u{1F4C8}"}
                      </span>
                    </div>
                  </div>
                  <button
                    className="luxury-button"
                    onClick={() => setBarcodeModalOpen(false)}
                    style={{
                      position: "absolute",
                      top: 18,
                      right: 18,
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      background: "rgba(255, 255, 255, 0.15)",
                      color: "white",
                      border: "1px solid rgba(255, 255, 255, 0.3)",
                      fontSize: `${baseSize * 1.1}px`,
                      fontWeight: 700,
                    }}
                    aria-label="Tutup"
                  >
                    X
                  </button>
                </div>

                <div className="p-4 md:p-5">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-4">
                    <div className="flex-1 md:text-right">
                      <h2
                        className="font-black mb-3"
                        style={{ fontSize: "clamp(1.4rem, 4vw, 2.1rem)", color: "white", letterSpacing: "-0.3px", lineHeight: 1.15 }}
                      >
                        {barcodeTarget.nama}
                      </h2>
                      <div className="flex flex-wrap md:justify-end gap-2">
                        <div
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl"
                          style={{
                            background: "linear-gradient(135deg, rgba(251, 191, 36, 0.3), rgba(245, 158, 11, 0.3))",
                            backdropFilter: "blur(10px)",
                            border: "2px solid rgba(251, 191, 36, 0.5)",
                          }}
                        >
                          <span style={{ fontSize: `${baseSize * 1}px`, color: "#fbbf24", fontWeight: 800 }}>
                            {"\u{2B50}"} {barcodeTarget.poin}
                          </span>
                        </div>
                        <div
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl"
                          style={{
                            background: "linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(5, 150, 105, 0.3))",
                            backdropFilter: "blur(10px)",
                            border: "2px solid rgba(16, 185, 129, 0.5)",
                          }}
                        >
                          <span style={{ fontSize: `${baseSize * 1}px`, color: "#10b981", fontWeight: 800 }}>
                            {"\u{1F3EB}"} {barcodeTarget.kelas || "-"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-4 md:p-5 rounded-2xl" style={{ boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)" }}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="stat-card p-3 rounded-2xl premium-shadow">
                        <div style={{ fontSize: `${baseSize * 0.8}px`, color: "#64748b", fontWeight: 600 }}>Hadir</div>
                        <div className="font-bold" style={{ fontSize: `${baseSize * 1.6}px`, color: primaryColor }}>
                          {selectedSummary?.hadir ?? 0}
                        </div>
                      </div>
                      <div className="stat-card p-3 rounded-2xl premium-shadow">
                        <div style={{ fontSize: `${baseSize * 0.8}px`, color: "#64748b", fontWeight: 600 }}>Izin</div>
                        <div className="font-bold" style={{ fontSize: `${baseSize * 1.6}px`, color: primaryColor }}>
                          {selectedSummary?.izin ?? 0}
                        </div>
                      </div>
                      <div className="stat-card p-3 rounded-2xl premium-shadow">
                        <div style={{ fontSize: `${baseSize * 0.8}px`, color: "#64748b", fontWeight: 600 }}>Sakit</div>
                        <div className="font-bold" style={{ fontSize: `${baseSize * 1.6}px`, color: primaryColor }}>
                          {selectedSummary?.sakit ?? 0}
                        </div>
                      </div>
                      <div className="stat-card p-3 rounded-2xl premium-shadow">
                        <div style={{ fontSize: `${baseSize * 0.8}px`, color: "#64748b", fontWeight: 600 }}>Alfa</div>
                        <div className="font-bold" style={{ fontSize: `${baseSize * 1.6}px`, color: primaryColor }}>
                          {selectedSummary?.alfa ?? 0}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 stat-card p-3 rounded-2xl premium-shadow">
                      <div style={{ fontSize: `${baseSize * 0.8}px`, color: "#64748b", fontWeight: 600 }}>Pelanggaran</div>
                      <div className="font-bold" style={{ fontSize: `${baseSize * 1.6}px`, color: "#ef4444" }}>
                        {selectedSummary?.pelanggaran ?? 0}
                      </div>
                    </div>
                    <div className="mt-4">
                      <button
                        className="luxury-button w-full px-5 py-2.5 rounded-xl font-bold shadow-lg"
                        style={{
                          background: primaryColor,
                          color: "white",
                          border: "1px solid rgba(37, 99, 235, 0.35)",
                          fontSize: `${baseSize * 0.9}px`,
                        }}
                        onClick={() => setBarcodeModalOpen(false)}
                      >
                        {"\u{2B05}\u{FE0F}"} Kembali
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      ) : null}

      {notif ? (
        <div
          style={{
            position: "fixed",
            top: 24,
            right: 24,
            backgroundColor: primaryColor,
            color: "white",
            padding: "16px 28px",
            borderRadius: 12,
            fontWeight: 600,
            boxShadow: "0 8px 16px rgba(0,0,0,0.3)",
            zIndex: 9999,
            animation: "fadeIn 0.3s ease",
          }}
        >
          {notif}
        </div>
      ) : null}
    </div>
  );
}
