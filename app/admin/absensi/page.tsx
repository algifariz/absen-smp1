"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
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

function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function AbsensiPage() {
  const [siswaData, setSiswaData] = useState<SiswaRecord[]>([]);
  const [manualInputOpen, setManualInputOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanSession, setScanSession] = useState(0);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "success" | "error">("idle");
  const [manualBarcode, setManualBarcode] = useState("");
  const [notif, setNotif] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<{ name: string; message: string; ok: boolean } | null>(null);
  const notifTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const scannerRunningRef = useRef<boolean>(false);
  const processAbsensiRef = useRef<(barcodeId: string) => Promise<void>>(null!);
  const lastScanRef = useRef<string | null>(null);
  const lastScanAtRef = useRef<number>(0);
  const [todayDate] = useState<string>(getTodayDate());
  const isClientReady = todayDate !== "";

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

  const showNotif = useCallback((message: string) => {
    setNotif(message);
  }, []);

  const playSuccessSound = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.3;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
      setTimeout(() => {
        ctx.close().catch(() => undefined);
      }, 250);
    } catch {
      // ignore audio errors
    }
  }, []);

  const playWarningSound = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = 520;
      gain.gain.value = 0.28;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
      setTimeout(() => {
        ctx.close().catch(() => undefined);
      }, 260);
    } catch {
      // ignore audio errors
    }
  }, []);

  const playErrorSound = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 320;
      gain.gain.value = 0.32;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.28);
      setTimeout(() => {
        ctx.close().catch(() => undefined);
      }, 320);
    } catch {
      // ignore audio errors
    }
  }, []);

  useEffect(() => {
    if (!scanFeedback) return;
    const timer = setTimeout(() => {
      setScanFeedback(null);
    }, 2000);
    return () => clearTimeout(timer);
  }, [scanFeedback]);

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
      showNotif("Gagal memuat data terbaru");
    }
  }, [showNotif]);

  const handleUpdateSiswa = useCallback(
    async (siswa: SiswaRecord, updates: Partial<SiswaRecord>) => {
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
    },
    [refreshData],
  );

  const processAbsensi = useCallback(
    async (barcodeId: string) => {
      const siswa = siswaData.find((s) => s.barcode_id === barcodeId);
      if (!siswa) {
        const message = "Barcode tidak ditemukan!";
        showNotif(`Gagal: ${message}`);
        setScanFeedback({ name: "Tidak dikenal", message, ok: false });
        playErrorSound();
        return;
      }
      const today = getTodayDate();
      if (siswa.absen_hari_ini === today && siswa.status_hari_ini === "hadir") {
        const message = `${siswa.nama} sudah hadir hari ini!`;
        showNotif(`Perhatian: ${message}`);
        setScanFeedback({ name: siswa.nama, message, ok: false });
        playWarningSound();
        return;
      }

      const shouldIncrement = siswa.absen_hari_ini !== today || siswa.status_hari_ini !== "hadir";
      const nextKehadiran = shouldIncrement ? siswa.kehadiran + 1 : siswa.kehadiran;
      const ok = await handleUpdateSiswa(siswa, {
        kehadiran: nextKehadiran,
        absen_hari_ini: today,
        status_hari_ini: "hadir",
      });

      if (ok) {
        const message =
          siswa.absen_hari_ini === today && siswa.status_hari_ini && siswa.status_hari_ini !== "hadir"
            ? `${siswa.nama} diubah menjadi hadir`
            : `${siswa.nama} berhasil absen!`;
        showNotif(`Sukses: ${message}`);
        setScanFeedback({ name: siswa.nama, message, ok: true });
        playSuccessSound();
        const { data: updatedLogs, error: updateError } = await supabase
          .from("absensi_log")
          .update({ status_hari_ini: "hadir" })
          .eq("siswa_id", siswa.id)
          .eq("tanggal", today)
          .select("id");

        if (updateError || !updatedLogs || updatedLogs.length === 0) {
          await supabase.from("absensi_log").insert({
            siswa_id: siswa.id,
            nama: siswa.nama,
            kelas: siswa.kelas,
            barcode_id: siswa.barcode_id,
            tanggal: today,
            status_hari_ini: "hadir",
            created_at: new Date().toISOString(),
          });
        }
      } else {
        const message = "Gagal mencatat absensi";
        showNotif(`Gagal: ${message}`);
        setScanFeedback({ name: siswa.nama, message, ok: false });
        playErrorSound();
      }
    },
    [siswaData, showNotif, handleUpdateSiswa, playSuccessSound, playWarningSound, playErrorSound],
  );

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
      return;
    }

    setScanFeedback(null);
    setScanStatus("scanning");
    lastScanRef.current = null;
    lastScanAtRef.current = 0;

    if (!navigator?.mediaDevices?.getUserMedia) {
      showNotif("Kamera tidak tersedia di perangkat ini");
      setScanFeedback({ name: "Kamera", message: "Kamera tidak tersedia di perangkat ini", ok: false });
      setScanStatus("error");
      return;
    }

    const scanner = new Html5Qrcode("qr-reader");
    qrScannerRef.current = scanner;

    const startScan = async () => {
      try {
        const devices = await Html5Qrcode.getCameras();
        const preferredDevice = devices.find((device) => /back|rear|environment/i.test(device.label));
        const deviceId = preferredDevice?.id || devices[0]?.id;
        if (!deviceId) {
          throw new Error("NoCameraFound");
        }
        await scanner.start(
          { deviceId: { exact: deviceId } },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          (decodedText) => {
            if (!decodedText) return;
            const now = Date.now();
            if (lastScanRef.current === decodedText && now - lastScanAtRef.current < 1500) {
              return;
            }
            lastScanRef.current = decodedText;
            lastScanAtRef.current = now;
            setScanStatus("success");
            processAbsensiRef.current(decodedText);
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
        showNotif(`Gagal: ${message}`);
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

  const handleRestartScan = () => {
    setScanFeedback(null);
    setScanStatus("scanning");
    setScanSession((prev) => prev + 1);
  };

  const scanStatusLabel = useMemo(() => {
    if (scanStatus === "scanning") return "Mendeteksi barcode...";
    if (scanStatus === "success") return "Berhasil";
    if (scanStatus === "error") return "Gagal";
    return "Siap memindai";
  }, [scanStatus]);

  const scanStatusStyle = useMemo(() => {
    if (scanStatus === "success") {
      return { background: "rgba(16, 185, 129, 0.2)", border: "1px solid rgba(16, 185, 129, 0.4)" };
    }
    if (scanStatus === "error") {
      return { background: "rgba(239, 68, 68, 0.2)", border: "1px solid rgba(239, 68, 68, 0.4)" };
    }
    return { background: "rgba(59, 130, 246, 0.2)", border: "1px solid rgba(59, 130, 246, 0.4)" };
  }, [scanStatus]);

  return (
    <>
      <div className="absensi-shell fade-in">
        <div className="glass-card rounded-2xl p-4 md:p-6 mb-4 md:mb-6 premium-shadow absensi-hero">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h1 className="font-black tracking-tight mb-2" style={{ fontSize: "2rem", color: "#0f172a" }}>
                Operasional Absensi
              </h1>
              <p style={{ fontSize: "0.9rem", color: "#64748b" }}>
                Scan barcode/QR atau input manual untuk mencatat kehadiran.
              </p>
            </div>
          </div>
        </div>

        {loadError ? (
          <div className="glass-card rounded-2xl p-4 md:p-6 mb-4 md:mb-6 premium-shadow">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <p className="font-semibold" style={{ color: "#0f172a" }}>
                  {loadError}
                </p>
                <p style={{ color: "#64748b", fontSize: "0.85rem" }}>
                  Coba muat ulang setelah memastikan env Supabase benar.
                </p>
              </div>
              <button className="btn btn--primary" onClick={() => refreshData()}>
                Muat Ulang
              </button>
            </div>
          </div>
        ) : null}

        <div className="card absensi-card">
          <div className="card__head">
            <div>
              <h2 className="card__title">Scan Barcode / QR Absensi</h2>
              <p className="card__desc">Gunakan kamera atau input manual untuk absensi.</p>
            </div>
            <span className="badge badge--green">Absensi</span>
          </div>

          <div className="two-col">
            <button className="btn btn--primary" type="button" onClick={() => setScanModalOpen(true)}>
              Buka Scanner
            </button>
            <button className="btn btn--ghost" type="button" onClick={() => setManualInputOpen((prev) => !prev)}>
              Input Manual
            </button>
          </div>

          {manualInputOpen ? (
            <div className="manual">
              <form
                className="form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const barcodeId = manualBarcode.trim();
                  if (barcodeId) {
                    processAbsensi(barcodeId);
                    setManualBarcode("");
                  }
                }}
              >
                <div className="field">
                  <label className="label" htmlFor="kode">
                    Kode QR/Barcode
                  </label>
                  <input
                    className="input"
                    id="kode"
                    placeholder="Tempel kode di sini..."
                    value={manualBarcode}
                    onChange={(e) => setManualBarcode(e.target.value)}
                  />
                </div>
                <div className="actions">
                  <button className="btn btn--primary" type="submit" disabled={isLoading}>
                    Proses
                  </button>
                  <button className="btn btn--ghost" type="button" onClick={() => setManualInputOpen(false)}>
                    Batal
                  </button>
                </div>
              </form>
            </div>
          ) : null}
        </div>
      </div>

      {scanModalOpen ? (
        <div className="modal-overlay">
          <div className="glass-card rounded-3xl p-6 md:p-8 max-w-xl w-full mx-4 premium-shadow">
            <h2 className="font-bold mb-4 text-center" style={{ fontSize: "1.8rem", color: "#0f172a" }}>
              Scan Barcode/QR Siswa
            </h2>
            <p className="text-center mb-4" style={{ fontSize: "1rem", color: "#0f172a", opacity: 0.7 }}>
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
                  fontSize: "0.85rem",
                }}
              >
                {scanStatusLabel}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                className="luxury-button w-full px-8 py-4 rounded-2xl font-bold shadow-lg"
                style={{
                  background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                  color: "white",
                  fontSize: "1rem",
                }}
                onClick={handleRestartScan}
              >
                Scan Ulang
              </button>
              <button
                className="luxury-button w-full px-8 py-4 rounded-2xl font-bold shadow-lg"
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  color: "#0f172a",
                  border: "2px solid rgba(255, 255, 255, 0.1)",
                  fontSize: "1rem",
                }}
                onClick={() => setScanModalOpen(false)}
              >
                Tutup Scanner
              </button>
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
            backgroundColor: "#2563eb",
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
    </>
  );
}
