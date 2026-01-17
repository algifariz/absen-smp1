
"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
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
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
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
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<{ name: string; message: string; ok: boolean } | null>(null);
  const notifTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const scannerRunningRef = useRef<boolean>(false);
  const processAbsensiRef = useRef<(barcodeId: string) => Promise<void>>(null!);
  const addSiswaRef = useRef<HTMLInputElement | null>(null);
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

        const { data: pelanggaranRows, error: pelanggaranError } = await supabase
          .from("records")
          .select("*")
          .eq("type", "pelanggaran")
          .order("poin_pelanggaran", { ascending: true });
        if (pelanggaranError) throw pelanggaranError;

        if (!isActive) return;
        setSiswaData((siswaRows as SiswaRecord[]) || []);
        setPelanggaranData((pelanggaranRows as PelanggaranRecord[]) || []);
      } catch {
        if (!isActive) return;
        setLoadError("Gagal memuat data. Periksa koneksi dan konfigurasi Supabase.");
        setSiswaData([]);
        setPelanggaranData([]);
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

      const { data: pelanggaranRows, error: pelanggaranError } = await supabase
        .from("records")
        .select("*")
        .eq("type", "pelanggaran")
        .order("poin_pelanggaran", { ascending: true });
      if (pelanggaranError) throw pelanggaranError;

      setSiswaData((siswaRows as SiswaRecord[]) || []);
      setPelanggaranData((pelanggaranRows as PelanggaranRecord[]) || []);
    } catch {
      setLoadError("Gagal memuat data. Periksa koneksi dan konfigurasi Supabase.");
      showNotif("\u{274C} Gagal memuat data terbaru");
    }
  }, [showNotif]);

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
      absen_hari_ini: null,
    });

    if (!error) {
      setFormNama("");
      setFormKelas("");
      showNotif(`\u{2705} ${nama} (${kelas}) berhasil ditambahkan!`);
      refreshData();
    } else {
      showNotif(`\u{274C} Gagal menambahkan siswa: ${error.message}`);
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
      showNotif(`\u{274C} Gagal menambahkan pelanggaran: ${error.message}`);
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
      setSiswaData((prev) =>
        prev.map((item) => (item.id === siswa.id ? { ...item, ...updates } : item)),
      );
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
    processAbsensiRef.current = processAbsensi;
  }, [processAbsensi]);

  useEffect(() => {
    if (!scanModalOpen) {
      if (qrScannerRef.current) {
        const scanner = qrScannerRef.current;
        qrScannerRef.current = null;
        if (scannerRunningRef.current) {
          scannerRunningRef.current = false;
          scanner
            .stop()
            .catch(() => undefined)
            .finally(() => {
              scanner.clear();
            });
        } else {
          scanner.clear();
        }
      }
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

    const scanner = new Html5Qrcode("qr-reader");
    qrScannerRef.current = scanner;

    const startScan = async () => {
      try {
        const devices = await Html5Qrcode.getCameras();
        const preferredDevice = devices.find((device) =>
          /back|rear|environment/i.test(device.label),
        );
        const deviceId = preferredDevice?.id || devices[0]?.id;
        if (!deviceId) {
          throw new Error("NoCameraFound");
        }
        await scanner.start(
          { deviceId: { exact: deviceId } },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          (decodedText) => {
            if (!decodedText) return;
            setScanStatus("success");
            processAbsensiRef.current(decodedText);
            if (scannerRunningRef.current) {
              scannerRunningRef.current = false;
              scanner.stop().catch(() => undefined);
            }
            scanCloseTimeoutRef.current = setTimeout(() => {
              setScanModalOpen(false);
            }, 1500);
          },
          () => undefined,
        );
        scannerRunningRef.current = true;
      } catch (error) {
        const err = error as { name?: string; message?: string };
        const reason = err?.name || err?.message || "UnknownError";
        let message = "Tidak bisa mengakses kamera";
        if (reason === "NotAllowedError") message = "Izin kamera ditolak. Silakan izinkan kamera.";
        if (reason === "NotFoundError") message = "Kamera tidak ditemukan.";
        if (reason === "NotReadableError") message = "Kamera sedang dipakai aplikasi lain.";
        if (reason === "SecurityError") message = "Gunakan https atau localhost untuk akses kamera.";
        if (reason === "NoCameraFound") message = "Kamera tidak ditemukan.";
        showNotif(`\u{274C} ${message}`);
        setScanFeedback({ name: "Kamera", message, ok: false });
        setScanStatus("error");
      }
    };

    startScan();

    return () => {
      if (qrScannerRef.current) {
        const scanner = qrScannerRef.current;
        qrScannerRef.current = null;
        if (scannerRunningRef.current) {
          scannerRunningRef.current = false;
          scanner
            .stop()
            .catch(() => undefined)
            .finally(() => {
              scanner.clear();
            });
        } else {
          scanner.clear();
        }
      }
    };
  }, [scanModalOpen, scanSession, showNotif]);
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
      canvas.width = 900;
      canvas.height = 560;

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

      if (qrDataUrl) {
        const qrSize = 260;
        const qrX = (canvas.width - qrSize) / 2;
        const qrY = 210;
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24);
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 2;
        ctx.strokeRect(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24);
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
      }

      ctx.font = "bold 20px Courier New";
      ctx.fillStyle = "#0f172a";
      ctx.fillText(siswa.barcode_id, canvas.width / 2, 210 + 260 + 44);

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

              <div className="space-y-3 md:space-y-5">
                {isLoading ? (
                  <div className="glass-card rounded-2xl text-center py-16 md:py-24 premium-shadow">
                    <div style={{ fontSize: `${baseSize * 3.5}px`, marginBottom: 16, opacity: 0.2 }}>{"\u{23F3}"}</div>
                    <p style={{ fontSize: `${baseSize}px`, color: "#94a3b8", fontWeight: 500 }}>
                      Memuat data siswa...
                    </p>
                  </div>
                ) : filteredSiswa.length === 0 ? (
                  <div className="glass-card rounded-2xl text-center py-16 md:py-24 premium-shadow">
                    <div style={{ fontSize: `${baseSize * 4}px`, marginBottom: 16, opacity: 0.15 }}>{"\u{1F4ED}"}</div>
                    <p style={{ fontSize: `${baseSize}px`, color: "#94a3b8", fontWeight: 500 }}>
                      Belum ada data siswa{selectedKelas !== "all" ? ` di kelas ${selectedKelas}` : ""}
                    </p>
                  </div>
                ) : (
                  filteredSiswa.map((siswa) => (
                    <div key={siswa.id} className="glass-card rounded-2xl p-4 md:p-6 premium-shadow">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3 md:gap-6 w-full sm:w-auto">
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
                  ))
                )}
              </div>
            </>
          ) : (
            <div
              className="admin-app"
              style={{
                ["--admin-primary"]: primaryColor,
                ["--admin-secondary"]: secondaryColor,
                ["--admin-text"]: textColor,
              }}
            >
              <aside className="admin-sidebar">
                <div className="brand">
                  <div className="brand__logo">📷</div>
                  <div className="brand__text">
                    <div className="brand__title">{config.judul_admin || defaultConfig.judul_admin}</div>
                    <div className="brand__sub">Absensi • Poin • Pelanggaran</div>
                  </div>
                </div>

                <nav className="nav">
                  <button className="nav__item nav__item--active" type="button">
                    <span className="nav__icon">📦</span>
                    <span>Data Master</span>
                  </button>
                  <Link className="nav__item" href="/admin/absensi">
                    <span className="nav__icon">🧾</span>
                    <span>Operational Absensi</span>
                  </Link>
                  <Link className="nav__item" href="/admin/siswa">
                    <span className="nav__icon">👥</span>
                    <span>Kelola Siswa</span>
                  </Link>
                  <Link className="nav__item" href="/admin/pelanggaran">
                    <span className="nav__icon">⚠️</span>
                    <span>Pelanggaran</span>
                  </Link>
                  <Link className="nav__item" href="/admin/poin">
                    <span className="nav__icon">⭐</span>
                    <span>Poin</span>
                  </Link>
                </nav>

                <div className="sidebar__footer">
                  <div className="pill">
                    <span className="dot dot--ok" />
                    <span>Online</span>
                  </div>
                  <button className="btn btn--ghost w-full" type="button" onClick={() => setCurrentView("leaderboard")}>
                    {config.tombol_kembali || defaultConfig.tombol_kembali}
                  </button>
                </div>
              </aside>

              <main className="admin-main">
                <header className="topbar">
                  <div className="topbar__left">
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">Kelola siswa, absensi, pelanggaran, dan poin dalam satu tempat.</p>
                  </div>

                  <div className="topbar__right">
                    <div className="search">
                      <span className="search__icon">🔎</span>
                      <input className="search__input" placeholder="Cari siswa / kelas..." />
                    </div>
                    <button
                      className="btn btn--primary"
                      type="button"
                      onClick={() => addSiswaRef.current?.focus()}
                    >
                      + Tambah
                    </button>
                  </div>
                </header>

                <section className="admin-grid">
                  <article className="card">
                    <div className="card__head">
                      <div>
                        <h2 className="card__title">Tambah Siswa Baru</h2>
                        <p className="card__desc">Input siswa ke data master dengan cepat.</p>
                      </div>
                      <span className="badge badge--blue">Data Master</span>
                    </div>

                    <form className="form" onSubmit={handleAddSiswa}>
                      <div className="field">
                        <label className="label" htmlFor="nama">
                          Nama Siswa
                        </label>
                        <input
                          className="input"
                          id="nama"
                          name="nama"
                          placeholder="Contoh: Budi Santoso"
                          value={formNama}
                          ref={addSiswaRef}
                          onChange={(e) => setFormNama(e.target.value)}
                          required
                        />
                      </div>

                      <div className="field">
                        <label className="label" htmlFor="kelas">
                          Kelas
                        </label>
                        <input
                          className="input"
                          id="kelas"
                          name="kelas"
                          placeholder="Contoh: X A"
                          value={formKelas}
                          onChange={(e) => setFormKelas(e.target.value)}
                          required
                        />
                      </div>

                      <div className="actions">
                        <button className="btn btn--primary" type="submit">
                          {config.tombol_simpan || defaultConfig.tombol_simpan}
                        </button>
                        <button
                          className="btn btn--ghost"
                          type="reset"
                          onClick={() => {
                            setFormNama("");
                            setFormKelas("");
                          }}
                        >
                          Reset
                        </button>
                      </div>
                    </form>
                  </article>


                  <article className="card">
                    <div className="card__head">
                      <div>
                        <h2 className="card__title">Kelola Daftar Pelanggaran</h2>
                        <p className="card__desc">Tambah dan atur jenis pelanggaran beserta poinnya.</p>
                      </div>
                      <span className="badge badge--red">Pelanggaran</span>
                    </div>

                    <form className="form" onSubmit={handleAddPelanggaran}>
                      <div className="field">
                        <label className="label" htmlFor="namaPelanggaran">
                          Nama Pelanggaran
                        </label>
                        <input
                          className="input"
                          id="namaPelanggaran"
                          placeholder="Contoh: Terlambat masuk kelas"
                          value={formPelanggaranNama}
                          onChange={(e) => setFormPelanggaranNama(e.target.value)}
                          required
                        />
                      </div>

                      <div className="field">
                        <label className="label" htmlFor="poinPelanggaran">
                          Poin (negatif)
                        </label>
                        <input
                          className="input"
                          id="poinPelanggaran"
                          type="number"
                          placeholder="-10"
                          value={formPelanggaranPoin}
                          onChange={(e) => setFormPelanggaranPoin(e.target.value)}
                          max={0}
                          required
                        />
                      </div>

                      <div className="actions">
                        <button className="btn btn--danger" type="submit">
                          + Tambah Pelanggaran
                        </button>
                      </div>
                    </form>

                    <div className="divider" />

                    <div className="list">
                      {pelanggaranData.length === 0 ? (
                        <div className="muted">Belum ada pelanggaran. Tambahkan pelanggaran pertama!</div>
                      ) : (
                        pelanggaranData.map((pelanggaran) => (
                          <div key={pelanggaran.id} className="list__row">
                            <div>
                              <div className="list__title">{pelanggaran.nama_pelanggaran}</div>
                              <div className="list__meta">Kode: {pelanggaran.id}</div>
                            </div>
                            <div className="right">
                              <span className="chip chip--red">{pelanggaran.poin_pelanggaran}</span>
                              <button
                                className="icon-btn"
                                title="Hapus"
                                type="button"
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
                                {confirmDeletePelanggaranIds[pelanggaran.id] ? "Yakin?" : "🗑️"}
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </article>

                  

                  
                </section>
              </main>
            </div>
          )}
        </div>
      </div>
      {scanModalOpen ? (
        <div className="modal-overlay">
          <div className="glass-card rounded-3xl p-6 md:p-8 max-w-xl w-full mx-4 premium-shadow">
            <h2 className="font-bold mb-4 text-center" style={{ fontSize: `${baseSize * 1.8}px`, color: textColor }}>
              {"\u{1F4F1}"} Scan Barcode/QR Siswa
            </h2>
            <p className="text-center mb-4" style={{ fontSize: `${baseSize}px`, color: textColor, opacity: 0.7 }}>
              Pastikan izin kamera aktif dan gunakan koneksi `https` atau `localhost`.
            </p>
            <div className="scanner-frame mb-6 mx-auto">
              <div id="qr-reader" style={{ width: "100%", height: "100%" }} />
              <div className="scan-line" />
              <div className="corner-tl" />
              <div className="corner-tr" />
              <div className="corner-bl" />
              <div className="corner-br" />
            </div>
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
















