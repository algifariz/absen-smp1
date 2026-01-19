"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
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

function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "S";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

export default function Home() {
  const [config] = useState<ConfigState>(defaultConfig);
  const [selectedKelas, setSelectedKelas] = useState<string>("all");
  const [siswaData, setSiswaData] = useState<SiswaRecord[]>([]);

  // Barcode Modal State
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [barcodeTarget, setBarcodeTarget] = useState<SiswaRecord | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const [notif, setNotif] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const notifTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [todayDate] = useState<string>(getTodayDate());
  const isClientReady = todayDate !== "";

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
    if (barcodeModalOpen && barcodeTarget) {
      QRCode.toDataURL(barcodeTarget.barcode_id, {
        width: 260,
        margin: 1,
        color: { dark: "#0f172a", light: "#ffffff" },
      })
        .then((url: string) => setQrDataUrl(url))
        .catch(() => setQrDataUrl(""));
    } else {
      setQrDataUrl("");
    }
  }, [barcodeModalOpen, barcodeTarget]);

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

  const handleDownloadBarcode = async (siswa: SiswaRecord) => {
    showNotif("\u{23F3} Memproses download...");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let qrDataUrl = "";
    try {
      qrDataUrl = await QRCode.toDataURL(siswa.barcode_id, {
        width: 360,
        margin: 2,
        color: { dark: "#0f172a", light: "#ffffff" },
      });
    } catch {
      qrDataUrl = "";
    }

    const qrImg = new Image();
    qrImg.onload = () => {
      canvas.width = 800;
      canvas.height = 1200;

      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      drawRoundedRect(ctx, 24, 24, canvas.width - 48, canvas.height - 48, 28);
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#1d4ed8";
      drawRoundedRect(ctx, 40, 40, 80, 80, 16);
      drawRoundedRect(ctx, canvas.width - 120, 40, 80, 80, 16);
      drawRoundedRect(ctx, 40, canvas.height - 120, 80, 80, 16);
      drawRoundedRect(ctx, canvas.width - 120, canvas.height - 120, 80, 80, 16);

      ctx.fillStyle = "#0f172a";
      ctx.font = "700 24px Arial";
      ctx.textAlign = "center";
      ctx.fillText("ABSENSI SMP", canvas.width / 2, 130);

      const qrSize = 220;
      const qrX = (canvas.width - qrSize) / 2;
      const qrY = 240;
      ctx.save();
      ctx.translate(canvas.width / 2, qrY + qrSize / 2);
      ctx.rotate(Math.PI / 4);
      drawRoundedRect(ctx, -140, -140, 280, 280, 22);
      ctx.fillStyle = "#1d4ed8";
      ctx.fill();
      ctx.restore();

      if (qrDataUrl) {
        drawRoundedRect(ctx, qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 20);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
      } else {
        ctx.fillStyle = "#e2e8f0";
        ctx.fillRect(qrX, qrY, qrSize, qrSize);
        ctx.fillStyle = "#94a3b8";
        ctx.font = "600 18px Arial";
        ctx.textAlign = "center";
        ctx.fillText(getInitials(siswa.nama), canvas.width / 2, qrY + qrSize / 2 + 8);
      }

      ctx.textAlign = "center";
      ctx.fillStyle = "#0f172a";
      ctx.font = "700 28px Arial";
      ctx.fillText(siswa.nama.toUpperCase(), canvas.width / 2, 580);

      const roleText = `Siswa Kelas ${siswa.kelas || "-"}`;
      ctx.font = "600 16px Arial";
      drawRoundedRect(ctx, canvas.width / 2 - 110, 604, 220, 32, 16);
      ctx.fillStyle = "#dcfce7";
      ctx.fill();
      ctx.fillStyle = "#166534";
      ctx.fillText(roleText, canvas.width / 2, 626);

      ctx.fillStyle = "#0f172a";
      ctx.font = "600 14px Courier New";
      ctx.fillText("ID NO", canvas.width / 2, 690);
      ctx.font = "700 18px Courier New";
      ctx.fillText(siswa.barcode_id, canvas.width / 2, 718);

      ctx.fillStyle = "#64748b";
      ctx.font = "500 12px Arial";
      ctx.fillText("Scan QR untuk absensi", canvas.width / 2, 744);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "500 12px Arial";
      const tanggal = new Date(siswa.dibuat).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      ctx.textAlign = "left";
      ctx.fillText(`Terdaftar: ${tanggal}`, 60, canvas.height - 60);

      ctx.textAlign = "right";

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = `Kartu_${siswa.nama.replace(/\s+/g, "_")}_${siswa.barcode_id}.png`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showNotif(`\u{2705} Kartu ${siswa.nama} berhasil didownload!`);
      }, "image/png");
    };
    qrImg.onerror = () => showNotif("\u{274C} Gagal membuat QR code");
    if (qrDataUrl) {
      qrImg.src = qrDataUrl;
    }
  };

  const textColor = config.text_color || defaultConfig.text_color;
  const primaryColor = config.primary_action || defaultConfig.primary_action;
  const secondaryColor = config.secondary_action || defaultConfig.secondary_action;
  const baseSize = config.font_size || defaultConfig.font_size;
  const barcodeStatusKnown = isClientReady;

  const barcodeHadir = barcodeStatusKnown && barcodeTarget?.absen_hari_ini === todayDate;
  const barcodeStatusLabel = !barcodeStatusKnown
    ? "Memuat..."
    : barcodeHadir
      ? "Hadir Hari Ini"
      : "Belum Absen";
  const barcodeBadgeStyle = !barcodeStatusKnown
    ? { background: "rgba(148, 163, 184, 0.2)", border: "2px solid rgba(148, 163, 184, 0.4)" }
    : barcodeHadir
      ? { background: "rgba(16, 185, 129, 0.3)", border: "3px solid #10b981" }
      : { background: "rgba(239, 68, 68, 0.3)", border: "3px solid #ef4444" };
  const barcodeBadgeIcon = !barcodeStatusKnown
    ? "\u{23F3}"
    : barcodeHadir
      ? "\u{2705}"
      : "\u{26A0}\u{FE0F}";
  const barcodeCreatedLabel = barcodeStatusKnown && barcodeTarget
    ? new Date(barcodeTarget.dibuat).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "-";

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
                  <Link
                    href="/admin/siswa"
                    className="luxury-button admin-cta inline-flex items-center justify-center gap-2"
                    style={{ background: primaryColor, color: "white", fontSize: `${baseSize * 0.9}px` }}
                  >
                      <span>{"\u{1F6E0}\u{FE0F}"}</span>
                      <span>{config.tombol_admin || defaultConfig.tombol_admin}</span>
                  </Link>
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
                  filteredSiswa.map((siswa, index) => (
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
                  ))
                )}
              </div>
            </>
        </div>
      </div>

      {barcodeModalOpen && barcodeTarget ? (
        <div className="modal-overlay" style={{ animation: "fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1)" }}>
          <div className="max-w-4xl w-full mx-4" style={{ animation: "fadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1)" }}>
            <div className="relative" style={{ perspective: 1000 }}>
              <div
                className="relative rounded-3xl shadow-2xl overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor} 0%, #1e40af 100%)`,
                  width: "100%",
                  maxWidth: 600,
                  margin: "0 auto",
                  transformStyle: "preserve-3d",
                  animation: "fadeIn 0.6s ease",
                }}
              >
                <div
                  className="relative p-8"
                  style={{
                    background: "linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.05))",
                    borderBottom: "2px solid rgba(255, 255, 255, 0.2)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(255, 255, 255, 0.2)", backdropFilter: "blur(10px)" }}>
                        <span style={{ fontSize: `${baseSize * 2}px` }}>{"\u{1F39F}\u{FE0F}"}</span>
                      </div>
                      <div>
                        <h3 className="font-black" style={{ fontSize: `${baseSize * 1.2}px`, color: "white", letterSpacing: 1, textTransform: "uppercase" }}>
                          Kartu Siswa
                        </h3>
                        <p style={{ fontSize: `${baseSize * 0.85}px`, color: "rgba(255, 255, 255, 0.8)" }}>ID: {barcodeTarget.barcode_id}</p>
                      </div>
                    </div>
                    <div
                      className="w-20 h-20 rounded-full flex items-center justify-center"
                      style={{ ...barcodeBadgeStyle, backdropFilter: "blur(10px)", animation: "pulse 2s ease-in-out infinite" }}
                    >
                      <span style={{ fontSize: `${baseSize * 2}px` }} suppressHydrationWarning>
                        {barcodeBadgeIcon}
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

                <div className="p-8">
                  <div className="flex justify-between items-start mb-8">
                    <div className="flex-1">
                      <div className="w-40 h-40 rounded-2xl flex items-center justify-center mb-4" style={{ background: "linear-gradient(135deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1))", backdropFilter: "blur(10px)", border: "3px solid rgba(255, 255, 255, 0.3)" }}>
                        <span style={{ fontSize: `${baseSize * 5}px` }}>{"\u{1F464}"}</span>
                      </div>
                      <div className="px-4 py-2 rounded-xl inline-block" style={{ background: "rgba(255, 255, 255, 0.15)", backdropFilter: "blur(10px)" }}>
                        <span style={{ fontSize: `${baseSize * 0.8}px`, color: "white", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }} suppressHydrationWarning>
                          {barcodeStatusLabel}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 text-right">
                      <h2 className="font-black mb-6" style={{ fontSize: `${baseSize * 2.5}px`, color: "white", letterSpacing: "-0.5px", lineHeight: 1.1 }}>
                        {barcodeTarget.nama}
                      </h2>
                      <div className="space-y-3">
                        <div className="inline-block px-6 py-3 rounded-xl" style={{ background: "linear-gradient(135deg, rgba(251, 191, 36, 0.3), rgba(245, 158, 11, 0.3))", backdropFilter: "blur(10px)", border: "2px solid rgba(251, 191, 36, 0.5)" }}>
                          <span style={{ fontSize: `${baseSize * 1.3}px`, color: "#fbbf24", fontWeight: 800 }}>
                            {"\u{2B50}"} {barcodeTarget.poin}
                          </span>
                        </div>
                        <div className="inline-block px-6 py-3 rounded-xl" style={{ background: "linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(5, 150, 105, 0.3))", backdropFilter: "blur(10px)", border: "2px solid rgba(16, 185, 129, 0.5)" }}>
                          <span style={{ fontSize: `${baseSize * 1.3}px`, color: "#10b981", fontWeight: 800 }}>
                            {"\u{2705}"} {barcodeTarget.kehadiran}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 md:p-8 rounded-2xl" style={{ boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)" }}>
                    <p className="text-center mb-4 font-black" style={{ fontSize: `${baseSize * 1.5}px`, color: "#1e293b", letterSpacing: 1 }}>
                      {barcodeTarget.nama}
                    </p>
                    {qrDataUrl ? (
                      <div
                        style={{
                          width: "60%",
                          margin: "0 auto",
                          padding: 12,
                          borderRadius: 14,
                          border: "2px solid #e2e8f0",
                          background: "#f8fafc",
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrDataUrl} alt="QR Code" style={{ width: "100%", height: "auto", display: "block" }} />
                      </div>
                    ) : (
                      <div className="text-center py-8" style={{ color: "#64748b", fontSize: `${baseSize * 0.9}px` }}>
                        QR code tidak tersedia
                      </div>
                    )}
                    <p className="text-center mt-4 font-black" style={{ fontSize: `${baseSize * 1.1}px`, color: "#1e293b", fontFamily: "Courier New, monospace", letterSpacing: 2 }}>
                      {barcodeTarget.barcode_id}
                    </p>
                    <svg id="barcodeSvg" style={{ display: "none" }} />
                    <div className="mt-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          className="luxury-button w-full px-6 py-3 rounded-xl font-bold shadow-lg"
                          style={{ background: `linear-gradient(135deg, ${secondaryColor}, #059669)`, color: "white", fontSize: `${baseSize * 0.95}px` }}
                          onClick={() => handleDownloadBarcode(barcodeTarget)}
                        >
                          {"\u{2B07}\u{FE0F}"} Download
                        </button>
                        <button
                          className="luxury-button w-full px-6 py-3 rounded-xl font-bold shadow-lg"
                          style={{
                            background: "rgba(15, 23, 42, 0.08)",
                            color: "#0f172a",
                            border: "1px solid rgba(15, 23, 42, 0.12)",
                            fontSize: `${baseSize * 0.95}px`,
                          }}
                          onClick={() => setBarcodeModalOpen(false)}
                        >
                          {"\u{2B05}\u{FE0F}"} Kembali
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-between">
                    <div>
                      <p style={{ fontSize: `${baseSize * 0.75}px`, color: "rgba(255, 255, 255, 0.6)", textTransform: "uppercase", letterSpacing: 1 }}>
                        Terdaftar Sejak
                      </p>
                      <p style={{ fontSize: `${baseSize * 0.9}px`, color: "white", fontWeight: 600 }}>
                        <span suppressHydrationWarning>{barcodeCreatedLabel}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p style={{ fontSize: `${baseSize * 0.75}px`, color: "rgba(255, 255, 255, 0.6)", textTransform: "uppercase", letterSpacing: 1 }}>
                        Tingkat Prestasi
                      </p>
                      <p style={{ fontSize: `${baseSize * 0.9}px`, color: "white", fontWeight: 600 }}>
                        {barcodeTarget.poin >= 100
                          ? "\u{1F3C6} Platinum"
                          : barcodeTarget.poin >= 50
                            ? "\u{1F947} Gold"
                            : barcodeTarget.poin >= 20
                              ? "\u{1F948} Silver"
                              : "\u{1F949} Bronze"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6" />

            <div className="mt-6 glass-card p-6 rounded-2xl premium-shadow" style={{ animation: "fadeIn 0.9s ease 0.5s both" }}>
              <h3 className="font-bold mb-3 flex items-center gap-2" style={{ fontSize: `${baseSize * 1.1}px`, color: textColor }}>
                <span style={{ fontSize: `${baseSize * 1.5}px` }}>{"\u{1F9FE}"}</span>
                <span>Cara Menggunakan:</span>
              </h3>
              <ul style={{ fontSize: `${baseSize * 0.95}px`, color: textColor, opacity: 0.8, lineHeight: 1.8 }}>
                <li style={{ marginBottom: 8 }}>{"1\u{FE0F}\u{20E3}"} Download kartu siswa dengan tombol di atas</li>
                <li style={{ marginBottom: 8 }}>{"2\u{FE0F}\u{20E3}"} Scan barcode di Panel Admin untuk absensi</li>
                <li style={{ marginBottom: 8 }}>{"3\u{FE0F}\u{20E3}"} Kartu dapat dicetak dan dilaminasi</li>
                <li>{"4\u{FE0F}\u{20E3}"} Simpan kode {barcodeTarget.barcode_id} untuk input manual</li>
              </ul>
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
