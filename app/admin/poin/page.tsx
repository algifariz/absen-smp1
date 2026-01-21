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
  created_at: string;
};

export default function PoinPage() {
  const [siswaData, setSiswaData] = useState<SiswaRecord[]>([]);
  const [formPoinSiswaId, setFormPoinSiswaId] = useState("");
  const [formPoinSiswaQuery, setFormPoinSiswaQuery] = useState("");
  const [formPoinJumlah, setFormPoinJumlah] = useState("");
  const [notif, setNotif] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanSession, setScanSession] = useState(0);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "success" | "error">("idle");
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const scannerRunningRef = useRef<boolean>(false);

  useEffect(() => {
    let isActive = true;
    const fetchAll = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const { data, error } = await supabase
          .from("records")
          .select("*")
          .eq("type", "siswa")
          .order("poin", { ascending: false });
        if (error) throw error;
        if (!isActive) return;
        setSiswaData((data as SiswaRecord[]) || []);
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
    const timer = setTimeout(() => setNotif(null), 3000);
    return () => clearTimeout(timer);
  }, [notif]);

  const showNotif = useCallback((message: string) => {
    setNotif(message);
  }, []);

  const refreshData = useCallback(async () => {
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("records")
        .select("*")
        .eq("type", "siswa")
        .order("poin", { ascending: false });
      if (error) throw error;
      setSiswaData((data as SiswaRecord[]) || []);
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
      showNotif("Pilih siswa terlebih dahulu");
      return;
    }
    if (Number.isNaN(jumlah) || jumlah <= 0) {
      showNotif("Jumlah poin harus lebih dari 0");
      return;
    }
    const ok = await handleUpdateSiswa(siswa, { poin: siswa.poin + jumlah });
    if (ok) {
      showNotif(`+${jumlah} poin untuk ${siswa.nama}`);
      setFormPoinSiswaId("");
      setFormPoinSiswaQuery("");
      setFormPoinJumlah("");
    } else {
      showNotif("Gagal menambah poin");
    }
  };

  const handleScanBarcode = useCallback(
    (barcodeId: string) => {
      const siswa = siswaData.find((item) => item.barcode_id === barcodeId);
      if (!siswa) {
        setScanStatus("error");
        showNotif("Barcode tidak ditemukan");
        return;
      }
      setFormPoinSiswaId(siswa.id);
      setFormPoinSiswaQuery(`${siswa.nama} (${siswa.kelas})`);
      setScanStatus("success");
      showNotif(`Siswa dipilih: ${siswa.nama}`);
      setScanModalOpen(false);
    },
    [siswaData, showNotif],
  );

  useEffect(() => {
    if (!scanModalOpen) {
      const scanner = qrScannerRef.current;
      if (scannerRunningRef.current && scanner) {
        scannerRunningRef.current = false;
        scanner
          .stop()
          .catch(() => {})
          .finally(() => {
            scanner.clear();
          });
      }
      return;
    }

    const startScanner = async () => {
      setScanStatus("scanning");
      const scanner = new Html5Qrcode("qr-reader-poin");
      qrScannerRef.current = scanner;
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 250 },
          (decodedText) => {
            if (scannerRunningRef.current) {
              scannerRunningRef.current = false;
              scanner.stop().catch(() => {});
            }
            handleScanBarcode(decodedText);
          },
          () => {},
        );
        scannerRunningRef.current = true;
      } catch {
        setScanStatus("error");
        showNotif("Tidak bisa membuka kamera");
      }
    };

    startScanner();

    return () => {
      const scanner = qrScannerRef.current;
      if (scannerRunningRef.current && scanner) {
        scannerRunningRef.current = false;
        scanner.stop().catch(() => {});
      }
      scanner?.clear();
    };
  }, [scanModalOpen, scanSession, handleScanBarcode, showNotif]);

  const handleRestartScan = () => {
    if (scannerRunningRef.current && qrScannerRef.current) {
      scannerRunningRef.current = false;
      qrScannerRef.current.stop().catch(() => {});
    }
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
        <div className="glass-card rounded-2xl p-4 md:p-6 mb-4 md:mb-6 premium-shadow absensi-hero dashboard-hero">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h1 className="font-black tracking-tight mb-2" style={{ fontSize: "2rem", color: "#0f172a" }}>
                Tambah Poin Custom
              </h1>
              <p style={{ fontSize: "0.9rem", color: "#0f172a" }}>
                Tambahkan poin ke siswa tertentu (reward atau penalty).
              </p>
            </div>
          </div>
        </div>

        {loadError ? (
          <div className="glass-card rounded-2xl p-4 md:p-6 mb-4 md:mb-6 premium-shadow">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <p className="font-semibold" style={{ color: "#0f172a" }}>
                  Perhatian: {loadError}
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

        <article className="card">
          <div className="card__head">
            <div>
              <h2 className="card__title">Form Poin Custom</h2>
              <p className="card__desc">Cari siswa lalu masukkan jumlah poin.</p>
            </div>
            <span className="badge badge--amber">Poin</span>
          </div>

          <form className="form" onSubmit={handleAddPoinCustom}>
            <div className="field">
              <label className="label" htmlFor="cariSiswa">
                Cari Siswa
              </label>
              <input
                className="input"
                id="cariSiswa"
                placeholder="Nama / NIS / Kelas..."
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
              />
              <datalist id="siswa-options">
                {siswaData.map((siswa) => (
                  <option key={siswa.id} value={`${siswa.nama} (${siswa.kelas})`} />
                ))}
              </datalist>
            </div>

            <div className="two-col">
              <button className="btn btn--primary" type="button" onClick={() => setScanModalOpen(true)}>
                Scan Barcode
              </button>
            </div>

            <div className="field">
              <label className="label" htmlFor="jumlahPoin">
                Jumlah Poin
              </label>
              <input
                className="input"
                id="jumlahPoin"
                type="number"
                placeholder="Contoh: 5"
                value={formPoinJumlah}
                onChange={(e) => setFormPoinJumlah(e.target.value)}
                min={1}
              />
            </div>

            <div className="actions">
              <button className="btn btn--primary" type="submit" disabled={isLoading}>
                Tambah Poin
              </button>
            </div>
          </form>
        </article>
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
              <div id="qr-reader-poin" style={{ width: "100%", height: "100%" }} />
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

