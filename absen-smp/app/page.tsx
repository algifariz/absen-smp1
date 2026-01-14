
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { BrowserMultiFormatReader } from "@zxing/library";
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

type PelanggaranRecord = {
  id: string;
  type: "pelanggaran";
  nama_pelanggaran: string;
  poin_pelanggaran: number;
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

type ViewMode = "leaderboard" | "admin";

function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

function generateBarcodeId() {
  return `STD${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export default function Home() {
  const [config] = useState<ConfigState>(defaultConfig);
  const [currentView, setCurrentView] = useState<ViewMode>("leaderboard");
  const [selectedKelas, setSelectedKelas] = useState<string>("all");
  const [siswaData, setSiswaData] = useState<SiswaRecord[]>([]);
  const [pelanggaranData, setPelanggaranData] = useState<PelanggaranRecord[]>([]);
  const [manualInputOpen, setManualInputOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanSession, setScanSession] = useState(0);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "success" | "error">("idle");
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [barcodeTarget, setBarcodeTarget] = useState<SiswaRecord | null>(null);
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<Record<string, boolean>>({});
  const [confirmDeletePelanggaranIds, setConfirmDeletePelanggaranIds] = useState<
    Record<string, boolean>
  >({});
  const [editingNama, setEditingNama] = useState<Record<string, string>>({});
  const [formNama, setFormNama] = useState("");
  const [formKelas, setFormKelas] = useState("");
  const [formPelanggaranNama, setFormPelanggaranNama] = useState("");
  const [formPelanggaranPoin, setFormPelanggaranPoin] = useState("");
  const [formPoinSiswaId, setFormPoinSiswaId] = useState("");
  const [formPoinSiswaQuery, setFormPoinSiswaQuery] = useState("");
  const [formPoinJumlah, setFormPoinJumlah] = useState("");
  const [manualBarcode, setManualBarcode] = useState("");
  const [notif, setNotif] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<{ name: string; message: string; ok: boolean } | null>(null);
  const notifTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scannerRef = useRef<BrowserMultiFormatReader | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [todayDate] = useState<string>(getTodayDate());
  const isClientReady = todayDate !== "";

  const kelasList = useMemo(() => {
    const kelasSet = new Set(siswaData.map((s) => s.kelas).filter(Boolean));
    return Array.from(kelasSet).sort();
  }, [siswaData]);

  const siswaByKelas = useMemo(() => {
    const groups = new Map<string, SiswaRecord[]>();
    siswaData.forEach((siswa) => {
      const key = siswa.kelas?.trim() ? siswa.kelas.trim().toUpperCase() : "Tanpa Kelas";
      const existing = groups.get(key) ?? [];
      existing.push(siswa);
      groups.set(key, existing);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [siswaData]);

  const filteredSiswa = useMemo(() => {
    if (selectedKelas === "all") return siswaData;
    return siswaData.filter((s) => s.kelas === selectedKelas);
  }, [selectedKelas, siswaData]);

  const totalSiswa = filteredSiswa.length;
  const totalPoin = filteredSiswa.reduce((sum, s) => sum + s.poin, 0);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const fetchAll = async () => {
      const { data: siswaRows } = await supabase
        .from("records")
        .select("*")
        .eq("type", "siswa")
        .order("poin", { ascending: false });
      const { data: pelanggaranRows } = await supabase
        .from("records")
        .select("*")
        .eq("type", "pelanggaran")
        .order("poin_pelanggaran", { ascending: true });

      setSiswaData((siswaRows as SiswaRecord[]) || []);
      setPelanggaranData((pelanggaranRows as PelanggaranRecord[]) || []);
    };

    fetchAll();
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
      const svg = document.getElementById("barcodeSvg") as SVGSVGElement | null;
      if (svg) {
        JsBarcode(svg, barcodeTarget.barcode_id, {
          format: "CODE128",
          width: 2,
          height: 80,
          displayValue: false,
          background: "#ffffff",
          lineColor: "#000000",
          margin: 10,
        });
      }
    }
  }, [barcodeModalOpen, barcodeTarget]);

  const showNotif = useCallback((message: string) => {
    setNotif(message);
  }, []);

  const refreshData = useCallback(async () => {
    const { data: siswaRows } = await supabase
      .from("records")
      .select("*")
      .eq("type", "siswa")
      .order("poin", { ascending: false });
    const { data: pelanggaranRows } = await supabase
      .from("records")
      .select("*")
      .eq("type", "pelanggaran")
      .order("poin_pelanggaran", { ascending: true });
    setSiswaData((siswaRows as SiswaRecord[]) || []);
    setPelanggaranData((pelanggaranRows as PelanggaranRecord[]) || []);
  }, []);

  const handleAddSiswa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (siswaData.length >= 999) {
      showNotif("\u{26A0}\u{FE0F} Maksimal 999 siswa tercapai!");
      return;
    }
    const nama = formNama.trim();
    const kelas = formKelas.trim().toUpperCase();
    if (!nama || !kelas) return;

    const barcodeId = generateBarcodeId();

    const { error } = await supabase.from("records").insert({
      id: Date.now().toString(),
      type: "siswa",
      nama,
      kelas,
      poin: 0,
      kehadiran: 0,
      dibuat: new Date().toISOString(),
      barcode_id: barcodeId,
      absen_hari_ini: "",
    });

    if (!error) {
      setFormNama("");
      setFormKelas("");
      showNotif(`\u{2705} ${nama} (${kelas}) berhasil ditambahkan!`);
      refreshData();
    } else {
      showNotif("\u{274C} Gagal menambahkan siswa");
    }
  };

  const handleAddPelanggaran = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pelanggaranData.length >= 50) {
      showNotif("\u{26A0}\u{FE0F} Maksimal 50 pelanggaran tercapai!");
      return;
    }
    const nama = formPelanggaranNama.trim();
    const poin = Number.parseInt(formPelanggaranPoin, 10);
    if (!nama || Number.isNaN(poin) || poin > 0) {
      showNotif("\u{26A0}\u{FE0F} Poin pelanggaran harus negatif!");
      return;
    }

    const { error } = await supabase.from("records").insert({
      id: Date.now().toString(),
      type: "pelanggaran",
      nama_pelanggaran: nama,
      poin_pelanggaran: poin,
    });

    if (!error) {
      setFormPelanggaranNama("");
      setFormPelanggaranPoin("");
      showNotif(`\u{2705} Pelanggaran "${nama}" (${poin}) ditambahkan!`);
      refreshData();
    } else {
      showNotif("\u{274C} Gagal menambahkan pelanggaran");
    }
  };

  const handleAddPoinCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    const siswa =
      siswaData.find((item) => item.id === formPoinSiswaId) ??
      siswaData.find(
        (item) =>
          `${item.nama} (${item.kelas})`.toLowerCase() === formPoinSiswaQuery.toLowerCase().trim(),
      );
    const jumlah = Number.parseInt(formPoinJumlah, 10);
    if (!siswa) {
      showNotif("\u{26A0}\u{FE0F} Pilih siswa terlebih dahulu");
      return;
    }
    if (Number.isNaN(jumlah) || jumlah <= 0) {
      showNotif("\u{26A0}\u{FE0F} Jumlah poin harus lebih dari 0");
      return;
    }
    const ok = await handleUpdateSiswa(siswa, { poin: siswa.poin + jumlah });
    if (ok) {
      showNotif(`\u{2705} +${jumlah} poin untuk ${siswa.nama}`);
      setFormPoinSiswaId("");
      setFormPoinSiswaQuery("");
      setFormPoinJumlah("");
    } else {
      showNotif("\u{274C} Gagal menambah poin");
    }
  };

  const handleUpdateSiswa = useCallback(async (siswa: SiswaRecord, updates: Partial<SiswaRecord>) => {
    const { error } = await supabase
      .from("records")
      .update(updates)
      .eq("id", siswa.id)
      .eq("type", "siswa");

    if (!error) {
      refreshData();
      return true;
    }
    return false;
  }, [refreshData]);

  const handleDeleteSiswa = async (siswa: SiswaRecord) => {
    const { error } = await supabase
      .from("records")
      .delete()
      .eq("id", siswa.id)
      .eq("type", "siswa");
    if (!error) {
      showNotif(`${siswa.nama} telah dihapus`);
      refreshData();
    } else {
      showNotif("\u{274C} Gagal menghapus");
    }
  };

  const handleDeletePelanggaran = async (pelanggaran: PelanggaranRecord) => {
    const { error } = await supabase
      .from("records")
      .delete()
      .eq("id", pelanggaran.id)
      .eq("type", "pelanggaran");
    if (!error) {
      showNotif(`Pelanggaran "${pelanggaran.nama_pelanggaran}" dihapus`);
      refreshData();
    } else {
      showNotif("\u{274C} Gagal menghapus");
    }
  };

  const processAbsensi = useCallback(async (barcodeId: string) => {
    const siswa = siswaData.find((s) => s.barcode_id === barcodeId);
    if (!siswa) {
      const message = "Barcode tidak ditemukan!";
      showNotif(`\u{274C} ${message}`);
      setScanFeedback({ name: "Tidak dikenal", message, ok: false });
      return;
    }
    const todayDate = getTodayDate();
    if (siswa.absen_hari_ini === todayDate) {
      const message = `${siswa.nama} sudah absen hari ini!`;
      showNotif(`\u{26A0}\u{FE0F} ${message}`);
      setScanFeedback({ name: siswa.nama, message, ok: false });
      return;
    }

    const ok = await handleUpdateSiswa(siswa, {
      kehadiran: siswa.kehadiran + 1,
      absen_hari_ini: todayDate,
    });

    if (ok) {
      const message = `${siswa.nama} berhasil absen!`;
      showNotif(`\u{2705} ${message}`);
      setScanFeedback({ name: siswa.nama, message, ok: true });
    } else {
      const message = "Gagal mencatat absensi";
      showNotif(`\u{274C} ${message}`);
      setScanFeedback({ name: siswa.nama, message, ok: false });
    }
  }, [siswaData, showNotif, handleUpdateSiswa]);

  useEffect(() => {
    if (!scanModalOpen) {
      scannerRef.current?.reset();
      scannerRef.current = null;
      setScanFeedback(null);
      setScanStatus("idle");
      if (scanCloseTimeoutRef.current) {
        clearTimeout(scanCloseTimeoutRef.current);
        scanCloseTimeoutRef.current = null;
      }
      return;
    }

    setScanFeedback(null);
    setScanStatus("scanning");

    if (!navigator?.mediaDevices?.getUserMedia) {
      showNotif("\u{274C} Kamera tidak tersedia di perangkat ini");
      setScanFeedback({ name: "Kamera", message: "Kamera tidak tersedia di perangkat ini", ok: false });
      setScanStatus("error");
      return;
    }

    const reader = new BrowserMultiFormatReader();
    scannerRef.current = reader;
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const startScan = async () => {
      try {
        const previewStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        previewStream.getTracks().forEach((track) => track.stop());

        const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
          (device: MediaDeviceInfo) => device.kind === "videoinput",
        );
        const preferredDevice = devices.find((device: MediaDeviceInfo) =>
          /back|rear|environment/i.test(device.label),
        );
        const deviceId = preferredDevice?.deviceId || devices[0]?.deviceId || null;
        const onResult = (result: unknown) => {
          if (result) {
            const text = (result as { getText?: () => string }).getText?.() ?? "";
            if (!text) return;
            setScanStatus("success");
            processAbsensi(text);
            scannerRef.current?.reset();
            scanCloseTimeoutRef.current = setTimeout(() => {
              setScanModalOpen(false);
            }, 1500);
          }
        };

        if (deviceId) {
          await reader.decodeFromVideoDevice(deviceId, videoEl, onResult);
          return;
        }

        await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          },
          videoEl,
          onResult,
        );
      } catch (error) {
        const err = error as { name?: string; message?: string };
        const reason = err?.name || "UnknownError";
        let message = "Tidak bisa mengakses kamera";
        if (reason === "NotAllowedError") message = "Izin kamera ditolak. Silakan izinkan kamera.";
        if (reason === "NotFoundError") message = "Kamera tidak ditemukan.";
        if (reason === "NotReadableError") message = "Kamera sedang dipakai aplikasi lain.";
        if (reason === "SecurityError") message = "Gunakan https atau localhost untuk akses kamera.";
        showNotif(`\u{274C} ${message}`);
        setScanFeedback({ name: "Kamera", message, ok: false });
        setScanStatus("error");
      }
    };

    startScan();

    return () => {
      reader.reset();
    };
  }, [scanModalOpen, scanSession, processAbsensi, showNotif]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const handlePlusPoin = async (siswa: SiswaRecord) => {
    const todayDate = getTodayDate();
    if (siswa.absen_hari_ini !== todayDate) {
      showNotif(`\u{26A0}\u{FE0F} ${siswa.nama} belum absen hari ini!`);
      return;
    }

    const ok = await handleUpdateSiswa(siswa, { poin: siswa.poin + 10 });
    if (ok) {
      showNotif(`\u{2705} +10 poin untuk ${siswa.nama}`);
    } else {
      showNotif("\u{274C} Gagal menambah poin");
    }
  };

  const handleMinusPoin = async (siswa: SiswaRecord) => {
    const ok = await handleUpdateSiswa(siswa, {
      poin: Math.max(0, siswa.poin - 10),
      kehadiran: Math.max(0, siswa.kehadiran - 1),
    });
    if (ok) {
      showNotif(`-10 poin untuk ${siswa.nama}`);
    } else {
      showNotif("\u{274C} Gagal mengurangi poin");
    }
  };

  const handlePelanggaran = async (
    siswa: SiswaRecord,
    poinPenalti: number,
    namaPelanggaran: string,
  ) => {
    const ok = await handleUpdateSiswa(siswa, {
      poin: Math.max(0, siswa.poin + poinPenalti),
    });
    if (ok) {
      showNotif(`\u{26A0}\u{FE0F} ${siswa.nama}: ${namaPelanggaran} (${poinPenalti} poin)`);
    } else {
      showNotif("\u{274C} Gagal mencatat pelanggaran");
    }
  };

  const handleEditNama = async (siswa: SiswaRecord) => {
    const newName = (editingNama[siswa.id] || "").trim();
    if (!newName || newName === siswa.nama) return;
    const ok = await handleUpdateSiswa(siswa, { nama: newName });
    if (ok) {
      showNotif(`\u{2705} Nama diubah menjadi "${newName}"`);
    } else {
      showNotif("\u{274C} Gagal mengubah nama");
    }
  };

  const handleRestartScan = () => {
    setScanFeedback(null);
    setScanStatus("scanning");
    setScanSession((prev) => prev + 1);
  };

  const handleDownloadBarcode = async (siswa: SiswaRecord) => {
    showNotif("\u{23F3} Memproses download...");
    const svg = document.getElementById("barcodeSvg") as SVGSVGElement | null;
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = 900;
      canvas.height = 520;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 22px Arial";
      ctx.textAlign = "left";
      ctx.fillText("KARTU SISWA", 40, 60);

      ctx.font = "16px Arial";
      ctx.fillStyle = "#475569";
      ctx.fillText("Sistem Absensi", 40, 86);

      ctx.textAlign = "center";
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 34px Arial";
      ctx.fillText(siswa.nama, canvas.width / 2, 150);

      ctx.font = "16px Arial";
      ctx.fillStyle = "#64748b";
      ctx.fillText(`Kelas: ${siswa.kelas}`, canvas.width / 2, 178);

      const barcodeMaxWidth = canvas.width - 160;
      const scale = Math.min(1, barcodeMaxWidth / img.width);
      const barcodeWidth = img.width * scale;
      const barcodeHeight = img.height * scale;
      const barcodeX = (canvas.width - barcodeWidth) / 2;
      const barcodeY = 210;
      ctx.drawImage(img, barcodeX, barcodeY, barcodeWidth, barcodeHeight);

      ctx.font = "bold 20px Courier New";
      ctx.fillStyle = "#0f172a";
      ctx.fillText(siswa.barcode_id, canvas.width / 2, barcodeY + barcodeHeight + 36);

      ctx.textAlign = "left";
      ctx.font = "14px Arial";
      ctx.fillStyle = "#475569";
      const tanggal = new Date(siswa.dibuat).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      ctx.fillText(`Terdaftar: ${tanggal}`, 40, canvas.height - 56);

      ctx.textAlign = "right";
      ctx.fillText(`Poin: ${siswa.poin}`, canvas.width - 40, canvas.height - 56);
      ctx.fillText(`Kehadiran: ${siswa.kehadiran}`, canvas.width - 40, canvas.height - 34);

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
    img.onerror = () => showNotif("\u{274C} Gagal membuat gambar barcode");
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}`;
  };

  const textColor = config.text_color || defaultConfig.text_color;
  const primaryColor = config.primary_action || defaultConfig.primary_action;
  const secondaryColor = config.secondary_action || defaultConfig.secondary_action;
  const baseSize = config.font_size || defaultConfig.font_size;
  const barcodeStatusKnown = isClientReady;
  const scanStatusLabel =
    scanStatus === "scanning"
      ? "Sedang memindai..."
      : scanStatus === "success"
        ? "Kode terdeteksi"
        : scanStatus === "error"
          ? "Kamera bermasalah"
          : "Siap memindai";
  const scanStatusStyle =
    scanStatus === "success"
      ? { background: "rgba(16, 185, 129, 0.2)", border: "1px solid rgba(16, 185, 129, 0.4)", color: "#10b981" }
      : scanStatus === "error"
        ? { background: "rgba(239, 68, 68, 0.2)", border: "1px solid rgba(239, 68, 68, 0.4)", color: "#ef4444" }
        : { background: "rgba(59, 130, 246, 0.2)", border: "1px solid rgba(59, 130, 246, 0.4)", color: primaryColor };
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
          {currentView === "leaderboard" ? (
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
                  <button
                    className="luxury-button px-5 py-2.5 md:px-6 md:py-3 rounded-xl font-semibold w-full md:w-auto"
                    style={{ background: primaryColor, color: "white", fontSize: `${baseSize * 0.9}px` }}
                    onClick={() => setCurrentView("admin")}
                  >
                    <span className="flex items-center justify-center gap-2">
                      <span>{"\u{1F6E0}\u{FE0F}"}</span>
                      <span>{config.tombol_admin || defaultConfig.tombol_admin}</span>
                    </span>
                  </button>
                </div>
              </div>

              {kelasList.length > 0 ? (
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
                        {totalSiswa}
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
                        {totalPoin}
                      </div>
                    </div>
                    <div style={{ fontSize: 36, opacity: 0.2 }}>{"\u{2B50}"}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 md:space-y-5">
                {filteredSiswa.length === 0 ? (
                  <div className="glass-card rounded-2xl text-center py-16 md:py-24 premium-shadow">
                    <div style={{ fontSize: `${baseSize * 4}px`, marginBottom: 16, opacity: 0.15 }}>{"\u{1F4ED}"}</div>
                    <p style={{ fontSize: `${baseSize}px`, color: "#94a3b8", fontWeight: 500 }}>
                      Belum ada data siswa{selectedKelas !== "all" ? ` di kelas ${selectedKelas}` : ""}
                    </p>
                  </div>
                ) : (
                  filteredSiswa.map((siswa, index) => {
                    let medalIcon: React.ReactNode = null;
                    let cardClasses = "glass-card";
                    if (index === 0) {
                      medalIcon = <div className="text-4xl md:text-6xl">{"\u{1F947}"}</div>;
                      cardClasses = "animated-border glass-card";
                    } else if (index === 1) {
                      medalIcon = <div className="text-4xl md:text-6xl">{"\u{1F948}"}</div>;
                    } else if (index === 2) {
                      medalIcon = <div className="text-4xl md:text-6xl">{"\u{1F949}"}</div>;
                    } else {
                      medalIcon = (
                        <div className="rank-badge w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center">
                          <span style={{ fontSize: `${baseSize}px`, fontWeight: 700, color: "#64748b" }}>
                            #{index + 1}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div key={siswa.id} className={`${cardClasses} rounded-2xl p-4 md:p-6 premium-shadow`}>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-3 md:gap-6 w-full sm:w-auto">
                            <div className="text-center" style={{ minWidth: 50 }}>
                              {medalIcon}
                            </div>
                            <div className="flex-1">
                              <div className="font-semibold mb-2" style={{ fontSize: `${baseSize * 1.1}px`, color: textColor }}>
                                {siswa.nama}
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {siswa.kelas ? (
                                  <div className="px-2.5 py-1 rounded-lg" style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
                                    <span style={{ fontSize: `${baseSize * 0.75}px`, color: "#2563eb", fontWeight: 600 }}>
                                      Kelas {siswa.kelas}
                                    </span>
                                  </div>
                                ) : null}
                                <div className="px-2.5 py-1 rounded-lg" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                                  <span style={{ fontSize: `${baseSize * 0.75}px`, color: "#16a34a", fontWeight: 600 }}>
                                    {"\u{2705}"} {siswa.kehadiran}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div
                            className="px-4 py-2 md:px-6 md:py-3 rounded-xl font-bold w-full sm:w-auto text-center"
                            style={{ background: primaryColor, color: "white", fontSize: `${baseSize * 1.2}px` }}
                          >
                            {siswa.poin} {"\u{2B50}"}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <>
              <div className="glass-card rounded-3xl p-4 md:p-8 mb-4 md:mb-8 premium-shadow">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <h1
                      className="font-black tracking-tight mb-2"
                      style={{
                        fontSize: `${baseSize * 2}px`,
                        color: textColor,
                        background: `linear-gradient(135deg, ${textColor}, ${primaryColor})`,
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                      }}
                    >
                      {config.judul_admin || defaultConfig.judul_admin}
                    </h1>
                    <p style={{ fontSize: `${baseSize * 0.85}px`, color: textColor, opacity: 0.6 }}>
                      Kelola Data Siswa & Poin
                    </p>
                  </div>
                  <button
                    className="luxury-button px-6 py-3 md:px-8 md:py-4 rounded-2xl font-bold shadow-lg w-full md:w-auto"
                    style={{
                      background: "rgba(255, 255, 255, 0.05)",
                      color: textColor,
                      border: "2px solid rgba(255, 255, 255, 0.1)",
                      fontSize: `${baseSize * 0.9}px`,
                    }}
                    onClick={() => setCurrentView("leaderboard")}
                  >
                    {config.tombol_kembali || defaultConfig.tombol_kembali}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-6">
                <div className="xl:col-span-5 space-y-4 md:space-y-6">
                  <div className="glass-card rounded-3xl p-4 md:p-7 premium-shadow">
                    <h2 className="font-bold mb-4 md:mb-6 flex items-center gap-2 md:gap-3" style={{ fontSize: `${baseSize * 1.25}px`, color: textColor }}>
                      <span className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${secondaryColor}, #059669)` }}>
                        {"\u{2795}"}
                      </span>
                      <span>Tambah Siswa Baru</span>
                    </h2>
                    <form className="space-y-3 md:space-y-4" onSubmit={handleAddSiswa}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                        <input
                          type="text"
                          required
                          value={formNama}
                          onChange={(e) => setFormNama(e.target.value)}
                          placeholder="Nama siswa..."
                          className="px-4 py-3 md:px-6 md:py-5 rounded-2xl focus:outline-none transition-all"
                          style={{
                            background: "rgba(255, 255, 255, 0.05)",
                            color: textColor,
                            fontSize: `${baseSize * 0.9}px`,
                            border: "2px solid rgba(255, 255, 255, 0.1)",
                            fontWeight: 500,
                          }}
                        />
                        <input
                          type="text"
                          required
                          value={formKelas}
                          onChange={(e) => setFormKelas(e.target.value)}
                          placeholder="Kelas (misal: 7A, 8B, 9C)..."
                          className="px-4 py-3 md:px-6 md:py-5 rounded-2xl focus:outline-none transition-all"
                          style={{
                            background: "rgba(255, 255, 255, 0.05)",
                            color: textColor,
                            fontSize: `${baseSize * 0.9}px`,
                            border: "2px solid rgba(255, 255, 255, 0.1)",
                            fontWeight: 500,
                          }}
                        />
                      </div>
                      <button
                        type="submit"
                        className="luxury-button w-full px-6 py-3 md:px-10 md:py-5 rounded-2xl font-bold shadow-lg"
                        style={{ background: `linear-gradient(135deg, ${secondaryColor}, #059669)`, color: "white", fontSize: `${baseSize * 0.95}px` }}
                      >
                        {config.tombol_simpan || defaultConfig.tombol_simpan}
                      </button>
                    </form>
                  </div>

                  <div className="glass-card rounded-3xl p-4 md:p-7 premium-shadow">
                    <h2 className="font-bold mb-4 md:mb-6 flex items-center gap-2 md:gap-3" style={{ fontSize: `${baseSize * 1.25}px`, color: textColor }}>
                      <span className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}>
                        {"\u{26A0}\u{FE0F}"}
                      </span>
                      <span>Kelola Daftar Pelanggaran</span>
                    </h2>
                    <form className="mb-4 md:mb-6" onSubmit={handleAddPelanggaran}>
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4">
                        <div className="md:col-span-7">
                          <label
                            className="block mb-2 font-semibold"
                            style={{ fontSize: `${baseSize * 0.8}px`, color: textColor, opacity: 0.7 }}
                          >
                            Nama pelanggaran
                          </label>
                          <input
                            type="text"
                            required
                            value={formPelanggaranNama}
                            onChange={(e) => setFormPelanggaranNama(e.target.value)}
                            placeholder="Contoh: terlambat masuk kelas"
                            className="w-full px-4 py-3 md:px-6 md:py-5 rounded-2xl focus:outline-none transition-all"
                            style={{
                              background: "rgba(255, 255, 255, 0.05)",
                              color: textColor,
                              fontSize: `${baseSize * 0.9}px`,
                              border: "2px solid rgba(255, 255, 255, 0.1)",
                              fontWeight: 500,
                            }}
                          />
                        </div>
                        <div className="md:col-span-5">
                          <label
                            className="block mb-2 font-semibold"
                            style={{ fontSize: `${baseSize * 0.8}px`, color: textColor, opacity: 0.7 }}
                          >
                            Poin (negatif)
                          </label>
                          <div className="grid grid-cols-1 gap-2 items-stretch">
                            <input
                              type="number"
                              required
                              value={formPelanggaranPoin}
                              onChange={(e) => setFormPelanggaranPoin(e.target.value)}
                              placeholder="-10"
                              max={0}
                              className="flex-1 px-4 py-3 md:px-6 md:py-5 rounded-2xl focus:outline-none transition-all"
                              style={{
                                background: "rgba(255, 255, 255, 0.05)",
                                color: textColor,
                                fontSize: `${baseSize * 0.9}px`,
                                border: "2px solid rgba(255, 255, 255, 0.1)",
                                fontWeight: 500,
                              }}
                            />
                          </div>
                          <div style={{ marginTop: 8, fontSize: `${baseSize * 0.75}px`, color: textColor, opacity: 0.6 }}>
                            Contoh: -5, -10, -20
                          </div>
                        </div>
                      </div>
                      <button
                        type="submit"
                        className="luxury-button w-full mt-3 px-6 py-3 md:px-8 md:py-4 rounded-2xl font-bold shadow-lg"
                        style={{
                          background: "linear-gradient(135deg, #ef4444, #dc2626)",
                          color: "white",
                          fontSize: `${baseSize * 0.9}px`,
                        }}
                      >
                        {"\u{2795}"} Tambah Pelanggaran
                      </button>
                    </form>

                    <div className="space-y-2 md:space-y-3">
                      {pelanggaranData.length === 0 ? (
                        <div
                          className="text-center py-6 md:py-8"
                          style={{ color: textColor, opacity: 0.5, fontSize: `${baseSize * 0.85}px` }}
                        >
                          Belum ada pelanggaran. Tambahkan pelanggaran pertama!
                        </div>
                      ) : (
                        pelanggaranData.map((pelanggaran) => (
                          <div
                            key={pelanggaran.id}
                            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 md:p-5 rounded-xl"
                            style={{
                              background: "rgba(239, 68, 68, 0.1)",
                              border: "1px solid rgba(239, 68, 68, 0.2)",
                            }}
                          >
                            <div className="flex items-center gap-2 md:gap-3 flex-1 w-full sm:w-auto">
                              <span
                                className="font-black px-3 py-1.5 md:px-4 md:py-2 rounded-lg flex-shrink-0"
                                style={{ background: "rgba(239, 68, 68, 0.2)", color: "#ef4444", fontSize: `${baseSize}px` }}
                              >
                                {pelanggaran.poin_pelanggaran}
                              </span>
                              <span
                                className="flex-1"
                                style={{ color: textColor, fontSize: `${baseSize * 0.9}px`, fontWeight: 500, wordBreak: "break-word" }}
                              >
                                {pelanggaran.nama_pelanggaran}
                              </span>
                            </div>
                            <button
                              className="btn-delete-pelanggaran luxury-button px-4 py-2 md:px-5 md:py-3 rounded-xl font-bold w-full sm:w-auto"
                              style={{
                                background: "linear-gradient(135deg, #dc2626, #991b1b)",
                                color: "white",
                                fontSize: `${baseSize * 0.85}px`,
                                minWidth: 64,
                              }}
                              onClick={() => {
                                if (confirmDeletePelanggaranIds[pelanggaran.id]) {
                                  handleDeletePelanggaran(pelanggaran);
                                  setConfirmDeletePelanggaranIds((prev) => ({ ...prev, [pelanggaran.id]: false }));
                                } else {
                                  setConfirmDeletePelanggaranIds((prev) => ({ ...prev, [pelanggaran.id]: true }));
                                  setTimeout(() => {
                                    setConfirmDeletePelanggaranIds((prev) => ({ ...prev, [pelanggaran.id]: false }));
                                  }, 3000);
                                }
                              }}
                            >
                              {confirmDeletePelanggaranIds[pelanggaran.id] ? "Yakin?" : "\u{1F5D1}\u{FE0F}"}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="xl:col-span-7 space-y-4 md:space-y-6">
                  <div className="glass-card rounded-3xl p-4 md:p-7 premium-shadow">
                    <h2 className="font-bold mb-4 md:mb-6 flex items-center gap-2 md:gap-3" style={{ fontSize: `${baseSize * 1.25}px`, color: textColor }}>
                      <span className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${primaryColor}, #2563eb)` }}>
                        {"\u{1F4F7}"}
                      </span>
                      <span>Scan Barcode/QR Absensi</span>
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 mb-4">
                      <button
                        className="luxury-button px-6 py-3 md:px-8 md:py-5 rounded-2xl font-bold shadow-lg"
                        style={{ background: `linear-gradient(135deg, ${primaryColor}, #2563eb)`, color: "white", fontSize: `${baseSize * 0.95}px` }}
                        onClick={() => setScanModalOpen(true)}
                      >
                        {"\u{1F4F7} Buka Scanner"}
                      </button>
                      <button
                        className="luxury-button px-6 py-3 md:px-8 md:py-5 rounded-2xl font-bold shadow-lg"
                        style={{
                          background: "rgba(255, 255, 255, 0.05)",
                          color: textColor,
                          fontSize: `${baseSize * 0.95}px`,
                          border: "2px solid rgba(255, 255, 255, 0.1)",
                        }}
                        onClick={() => setManualInputOpen((prev) => !prev)}
                      >
                        {"\u{2328}\u{FE0F} Input Manual"}
                      </button>
                    </div>

                    {manualInputOpen ? (
                      <div style={{ marginTop: 12 }}>
                        <form
                          className="flex flex-col sm:flex-row gap-3 md:gap-4"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const barcodeId = manualBarcode.trim();
                            if (barcodeId) {
                              processAbsensi(barcodeId);
                              setManualBarcode("");
                            }
                          }}
                        >
                          <input
                            type="text"
                            value={manualBarcode}
                            onChange={(e) => setManualBarcode(e.target.value)}
                            placeholder="Masukkan kode barcode/QR..."
                            className="flex-1 px-4 py-3 md:px-6 md:py-5 rounded-2xl focus:outline-none transition-all"
                            style={{
                              background: "rgba(255, 255, 255, 0.05)",
                              color: textColor,
                              fontSize: `${baseSize * 0.9}px`,
                              border: "2px solid rgba(255, 255, 255, 0.1)",
                              fontWeight: 500,
                            }}
                          />
                          <button
                            type="submit"
                            className="luxury-button px-6 py-3 md:px-10 md:py-5 rounded-2xl font-bold shadow-lg"
                            style={{ background: `linear-gradient(135deg, ${secondaryColor}, #059669)`, color: "white", fontSize: `${baseSize * 0.95}px` }}
                          >
                            Absen
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </div>

                  <div className="glass-card rounded-3xl p-4 md:p-7 premium-shadow">
                    <h2 className="font-bold mb-4 md:mb-6 flex items-center gap-2 md:gap-3" style={{ fontSize: `${baseSize * 1.25}px`, color: textColor }}>
                      <span className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${secondaryColor}, #059669)` }}>
                        {"\u{2B50}"}
                      </span>
                      <span>Tambah Poin Custom</span>
                    </h2>
                    <form className="space-y-3 md:space-y-4" onSubmit={handleAddPoinCustom}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                        <div>
                          <label
                            className="block mb-2 font-semibold"
                            style={{ fontSize: `${baseSize * 0.8}px`, color: textColor, opacity: 0.7 }}
                          >
                            Pilih siswa
                          </label>
                          <input
                            type="text"
                            list="siswa-options"
                            value={formPoinSiswaQuery}
                            onChange={(e) => {
                              const value = e.target.value;
                              setFormPoinSiswaQuery(value);
                              const match = siswaData.find(
                                (item) => `${item.nama} (${item.kelas})` === value,
                              );
                              setFormPoinSiswaId(match?.id ?? "");
                            }}
                            placeholder="Cari siswa..."
                            className="w-full px-4 py-3 md:px-6 md:py-5 rounded-2xl focus:outline-none transition-all"
                            style={{
                              background: "rgba(255, 255, 255, 0.05)",
                              color: textColor,
                              fontSize: `${baseSize * 0.9}px`,
                              border: "2px solid rgba(255, 255, 255, 0.1)",
                              fontWeight: 500,
                            }}
                          />
                          <datalist id="siswa-options">
                            {siswaData.map((siswa) => (
                              <option key={siswa.id} value={`${siswa.nama} (${siswa.kelas})`} />
                            ))}
                          </datalist>
                        </div>
                        <div>
                          <label
                            className="block mb-2 font-semibold"
                            style={{ fontSize: `${baseSize * 0.8}px`, color: textColor, opacity: 0.7 }}
                          >
                            Jumlah poin
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={formPoinJumlah}
                            onChange={(e) => setFormPoinJumlah(e.target.value)}
                            placeholder="Contoh: 5"
                            className="w-full px-4 py-3 md:px-6 md:py-5 rounded-2xl focus:outline-none transition-all"
                            style={{
                              background: "rgba(255, 255, 255, 0.05)",
                              color: textColor,
                              fontSize: `${baseSize * 0.9}px`,
                              border: "2px solid rgba(255, 255, 255, 0.1)",
                              fontWeight: 500,
                            }}
                          />
                          <div style={{ marginTop: 8, fontSize: `${baseSize * 0.75}px`, color: textColor, opacity: 0.6 }}>
                            Contoh: 5, 10, 20
                          </div>
                        </div>
                      </div>
                      <button
                        type="submit"
                        className="luxury-button w-full px-6 py-3 md:px-10 md:py-5 rounded-2xl font-bold shadow-lg"
                        style={{ background: `linear-gradient(135deg, ${secondaryColor}, #059669)`, color: "white", fontSize: `${baseSize * 0.95}px` }}
                      >
                        {"\u{2795}"} Tambah Poin
                      </button>
                    </form>
                  </div>

                  <div className="space-y-3 md:space-y-5">
                    <div className="flex items-center justify-between mb-2 md:mb-4">
                      <h2 className="font-bold flex items-center gap-2 md:gap-3" style={{ fontSize: `${baseSize * 1.25}px`, color: textColor }}>
                        <span className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${primaryColor}, #2563eb)` }}>
                          {"\u{1F465}"}
                        </span>
                        <span>Kelola Siswa ({siswaData.length})</span>
                      </h2>
                    </div>
                    {siswaData.length === 0 ? (
                      <div className="glass-card rounded-3xl text-center py-20 md:py-28 premium-shadow">
                        <div style={{ fontSize: `${baseSize * 5}px`, marginBottom: 24, opacity: 0.3 }}>{"\u{1F4ED}"}</div>
                        <p style={{ fontSize: `${baseSize * 1.1}px`, color: textColor, opacity: 0.5, fontWeight: 600 }}>
                          Belum ada siswa
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-8">
                        {siswaByKelas.map(([kelas, siswaList]) => (
                          <div key={kelas} className="space-y-4 md:space-y-5">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div
                                className="px-4 py-2 rounded-2xl font-bold"
                                style={{
                                  background: "linear-gradient(135deg, rgba(37, 99, 235, 0.18), rgba(14, 165, 233, 0.18))",
                                  color: textColor,
                                  border: "1px solid rgba(59, 130, 246, 0.3)",
                                  fontSize: `${baseSize}px`,
                                }}
                              >
                                Kelas {kelas}
                              </div>
                              <div
                                className="px-4 py-2 rounded-2xl font-semibold"
                                style={{
                                  background: "rgba(255, 255, 255, 0.05)",
                                  color: textColor,
                                  border: "1px solid rgba(255, 255, 255, 0.1)",
                                  fontSize: `${baseSize * 0.85}px`,
                                }}
                              >
                                {siswaList.length} siswa
                              </div>
                            </div>
                            {siswaList.map((siswa) => {
                    const sudahAbsen = isClientReady && siswa.absen_hari_ini === todayDate;
                    const statusKnown = isClientReady;
                    const statusLabel = !statusKnown
                      ? "Memuat..."
                      : sudahAbsen
                        ? "Hadir Hari Ini"
                        : "Belum Absen";
                    const statusStyle = !statusKnown
                      ? {
                          background: "rgba(148, 163, 184, 0.2)",
                          border: "1px solid rgba(148, 163, 184, 0.4)",
                        }
                      : sudahAbsen
                        ? {
                            background: "rgba(16, 185, 129, 0.2)",
                            border: "1px solid rgba(16, 185, 129, 0.4)",
                          }
                        : {
                            background: "rgba(239, 68, 68, 0.2)",
                            border: "1px solid rgba(239, 68, 68, 0.4)",
                          };
                    const btnPlusDisabled = !sudahAbsen;
                    return (
                      <div key={siswa.id} className="glass-card rounded-3xl p-4 md:p-8 premium-shadow">
                        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-4 md:mb-6 gap-4">
                          <div className="flex-1 w-full">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 md:gap-4 mb-3">
                              <input
                                className="font-bold"
                                value={editingNama[siswa.id] ?? siswa.nama}
                                onChange={(e) =>
                                  setEditingNama((prev) => ({
                                    ...prev,
                                    [siswa.id]: e.target.value,
                                  }))
                                }
                                onBlur={() => handleEditNama(siswa)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    (e.currentTarget as HTMLInputElement).blur();
                                  }
                                }}
                                style={{
                                  fontSize: `${baseSize * 1.2}px`,
                                  color: textColor,
                                  cursor: "text",
                                  outline: "none",
                                  padding: "8px 12px",
                                  borderRadius: 12,
                                  transition: "all 0.3s",
                                  background: "rgba(255, 255, 255, 0.02)",
                                  width: "100%",
                                }}
                              />
                              <div className="px-3 py-1.5 md:px-4 md:py-2 rounded-xl inline-block" style={statusStyle}>
                                <span
                                  style={{
                                    fontSize: `${baseSize * 0.8}px`,
                                    color: statusKnown ? (sudahAbsen ? "#10b981" : "#ef4444") : "#94a3b8",
                                    fontWeight: 700,
                                  }}
                                  suppressHydrationWarning
                                >
                                  {statusLabel}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 md:gap-4">
                              <div className="px-3 py-1.5 md:px-5 md:py-2 rounded-xl" style={{ background: "linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(37, 99, 235, 0.15))", border: "1px solid rgba(59, 130, 246, 0.3)" }}>
                                <span style={{ fontSize: `${baseSize * 0.85}px`, color: primaryColor, fontWeight: 700 }}>
                                  {"\u{2B50}"} {siswa.poin} poin
                                </span>
                              </div>
                              <div className="px-3 py-1.5 md:px-5 md:py-2 rounded-xl" style={{ background: "linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.15))", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                                <span style={{ fontSize: `${baseSize * 0.85}px`, color: secondaryColor, fontWeight: 700 }}>
                                  {"\u{2705}"} {siswa.kehadiran} hadir
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 sm:flex gap-2 md:gap-3 w-full lg:w-auto">
                            <button
                              className="btn-show-barcode luxury-button px-3 py-2 md:px-6 md:py-3 rounded-xl font-bold shadow-md"
                              style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "white", fontSize: `${baseSize * 0.9}px` }}
                              onClick={() => {
                                setBarcodeTarget(siswa);
                                setBarcodeModalOpen(true);
                              }}
                            >
                              {"\u{1F39F}\u{FE0F}"}
                            </button>
                            <button
                              className="btn-minus luxury-button px-3 py-2 md:px-6 md:py-3 rounded-xl font-bold shadow-md"
                              style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "white", fontSize: `${baseSize * 0.9}px` }}
                              onClick={() => handleMinusPoin(siswa)}
                            >
                              -10
                            </button>
                            <button
                              className={`btn-plus luxury-button px-3 py-2 md:px-6 md:py-3 rounded-xl font-bold shadow-md ${btnPlusDisabled ? "opacity-50" : ""}`}
                              style={{
                                background: `linear-gradient(135deg, ${secondaryColor}, #059669)`,
                                color: "white",
                                fontSize: `${baseSize * 0.9}px`,
                                cursor: btnPlusDisabled ? "not-allowed" : "pointer",
                              }}
                              disabled={btnPlusDisabled}
                              onClick={() => handlePlusPoin(siswa)}
                            >
                              +10
                            </button>
                            <button
                              className="btn-violation luxury-button px-3 py-2 md:px-6 md:py-3 rounded-xl font-bold shadow-md"
                              style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "white", fontSize: `${baseSize * 0.9}px` }}
                              onClick={() => {
                                setConfirmDeleteIds((prev) => ({ ...prev, [`panel-${siswa.id}`]: !prev[`panel-${siswa.id}`] }));
                              }}
                            >
                              {"\u{26A0}\u{FE0F}"}
                            </button>
                            <button
                              className="btn-delete luxury-button px-3 py-2 md:px-6 md:py-3 rounded-xl font-bold shadow-md"
                              style={{ background: "linear-gradient(135deg, #dc2626, #991b1b)", color: "white", fontSize: `${baseSize * 0.9}px` }}
                              onClick={() => {
                                if (confirmDeleteIds[siswa.id]) {
                                  handleDeleteSiswa(siswa);
                                  setConfirmDeleteIds((prev) => ({ ...prev, [siswa.id]: false }));
                                } else {
                                  setConfirmDeleteIds((prev) => ({ ...prev, [siswa.id]: true }));
                                  setTimeout(() => {
                                    setConfirmDeleteIds((prev) => ({ ...prev, [siswa.id]: false }));
                                  }, 3000);
                                }
                              }}
                            >
                              {confirmDeleteIds[siswa.id] ? "Yakin?" : "\u{1F5D1}\u{FE0F}"}
                            </button>
                          </div>
                        </div>

                        {confirmDeleteIds[`panel-${siswa.id}`] ? (
                          <div className="violation-panel" style={{ marginTop: 16, paddingTop: 16, borderTop: "2px solid rgba(255, 255, 255, 0.05)" }}>
                            <h3 className="font-bold mb-4 md:mb-5 flex items-center gap-2" style={{ fontSize: `${baseSize}px`, color: textColor }}>
                              <span>{"\u{26A0}\u{FE0F}"} Pilih Jenis Pelanggaran:</span>
                            </h3>
                            {pelanggaranData.length === 0 ? (
                              <div className="text-center py-6 md:py-8" style={{ color: textColor, opacity: 0.5, fontSize: `${baseSize * 0.9}px` }}>
                                Belum ada pelanggaran. Tambahkan pelanggaran di menu Kelola Pelanggaran terlebih dahulu.
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3 mb-4">
                                {pelanggaranData.map((pelanggaran) => (
                                  <button
                                    key={pelanggaran.id}
                                    className="violation-item luxury-button px-4 py-3 md:px-5 md:py-4 rounded-xl text-left transition-all"
                                    style={{
                                      background: "rgba(239, 68, 68, 0.1)",
                                      color: textColor,
                                      fontSize: `${baseSize * 0.85}px`,
                                      border: "1px solid rgba(239, 68, 68, 0.2)",
                                    }}
                                    onClick={() => {
                                      handlePelanggaran(siswa, pelanggaran.poin_pelanggaran, pelanggaran.nama_pelanggaran);
                                      setConfirmDeleteIds((prev) => ({ ...prev, [`panel-${siswa.id}`]: false }));
                                    }}
                                  >
                                    <span className="font-black" style={{ color: "#ef4444", fontSize: `${baseSize}px` }}>
                                      {pelanggaran.poin_pelanggaran}
                                    </span>
                                    <span style={{ opacity: 0.8 }}> - {pelanggaran.nama_pelanggaran}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                            <button
                              className="btn-close-violation luxury-button px-4 py-2 md:px-6 md:py-3 rounded-xl font-semibold"
                              style={{
                                background: "rgba(255, 255, 255, 0.05)",
                                color: textColor,
                                fontSize: `${baseSize * 0.85}px`,
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                              }}
                              onClick={() => setConfirmDeleteIds((prev) => ({ ...prev, [`panel-${siswa.id}`]: false }))}
                            >
                              Tutup Panel
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {scanModalOpen ? (
        <div className="modal-overlay">
          <div className="glass-card rounded-3xl p-6 md:p-8 max-w-2xl w-full mx-4 premium-shadow">
            <h2 className="font-bold mb-4 text-center" style={{ fontSize: `${baseSize * 1.8}px`, color: textColor }}>
              {"\u{1F4F1}"} Scan Barcode/QR Siswa
            </h2>
            <p className="text-center mb-4" style={{ fontSize: `${baseSize}px`, color: textColor, opacity: 0.7 }}>
              Pastikan izin kamera aktif dan gunakan koneksi `https` atau `localhost`.
            </p>
            <div className="flex items-center justify-center mb-4">
              <div
                className="px-4 py-2 rounded-2xl font-semibold"
                style={{
                  ...scanStatusStyle,
                  fontSize: `${baseSize * 0.85}px`,
                }}
              >
                {scanStatusLabel}
              </div>
            </div>
            <div className="scanner-frame mb-6 mx-auto">
              <video
                ref={videoRef}
                playsInline
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              <div className="scan-line" />
              <div className="corner-tl" />
              <div className="corner-tr" />
              <div className="corner-bl" />
              <div className="corner-br" />
            </div>
            <div
              className="rounded-2xl p-4 mb-6 mx-auto"
              style={{
                background: scanFeedback?.ok ? "rgba(16, 185, 129, 0.12)" : "rgba(148, 163, 184, 0.12)",
                border: scanFeedback?.ok ? "1px solid rgba(16, 185, 129, 0.25)" : "1px solid rgba(148, 163, 184, 0.2)",
                maxWidth: 420,
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold" style={{ fontSize: `${baseSize * 1.05}px`, color: textColor }}>
                    {scanFeedback ? scanFeedback.name : "Menunggu scan..."}
                  </div>
                  <div style={{ fontSize: `${baseSize * 0.9}px`, color: textColor, opacity: 0.7 }}>
                    {scanFeedback ? scanFeedback.message : "Arahkan kamera ke barcode atau QR siswa"}
                  </div>
                </div>
                <div style={{ fontSize: `${baseSize * 1.8}px` }}>
                  {scanFeedback
                    ? scanFeedback.ok
                      ? "\u{2705}"
                      : "\u{26A0}\u{FE0F}"
                    : scanStatus === "scanning"
                      ? "\u{1F3AF}"
                      : "\u{1F50E}"}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                className="luxury-button w-full px-8 py-4 rounded-2xl font-bold shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor}, #2563eb)`,
                  color: "white",
                  fontSize: `${baseSize}px`,
                }}
                onClick={handleRestartScan}
              >
                Scan Ulang
              </button>
              <button
                className="luxury-button w-full px-8 py-4 rounded-2xl font-bold shadow-lg"
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  color: textColor,
                  border: "2px solid rgba(255, 255, 255, 0.1)",
                  fontSize: `${baseSize}px`,
                }}
                onClick={() => setScanModalOpen(false)}
              >
                Tutup Scanner
              </button>
            </div>
          </div>
        </div>
      ) : null}

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

                  <div className="bg-white p-8 rounded-2xl" style={{ boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)" }}>
                    <p className="text-center mb-4 font-black" style={{ fontSize: `${baseSize * 1.5}px`, color: "#1e293b", letterSpacing: 1 }}>
                      {barcodeTarget.nama}
                    </p>
                    <svg id="barcodeSvg" style={{ width: "100%" }} />
                    <p className="text-center mt-4 font-black" style={{ fontSize: `${baseSize * 1.3}px`, color: "#1e293b", fontFamily: "Courier New, monospace", letterSpacing: 3 }}>
                      {barcodeTarget.barcode_id}
                    </p>
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

            <div className="grid grid-cols-2 gap-4 mt-8" style={{ animation: "fadeIn 0.8s ease 0.4s both" }}>
              <button
                className="luxury-button px-8 py-5 rounded-2xl font-bold shadow-lg"
                style={{ background: `linear-gradient(135deg, ${secondaryColor}, #059669)`, color: "white", fontSize: `${baseSize * 1.1}px` }}
                onClick={() => handleDownloadBarcode(barcodeTarget)}
              >
                <span className="flex items-center justify-center gap-2">
                  <span style={{ fontSize: `${baseSize * 1.8}px` }}>{"\u{2B07}\u{FE0F}"}</span>
                  <span>Download Kartu</span>
                </span>
              </button>
              <button
                className="luxury-button px-8 py-5 rounded-2xl font-bold shadow-lg"
                style={{
                  background: "rgba(255, 255, 255, 0.1)",
                  color: "white",
                  border: "2px solid rgba(255, 255, 255, 0.2)",
                  fontSize: `${baseSize * 1.1}px`,
                }}
                onClick={() => setBarcodeModalOpen(false)}
              >
                <span className="flex items-center justify-center gap-2">
                  <span style={{ fontSize: `${baseSize * 1.8}px` }}>{"\u{2716}\u{FE0F}"}</span>
                  <span>Tutup</span>
                </span>
              </button>
            </div>

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













