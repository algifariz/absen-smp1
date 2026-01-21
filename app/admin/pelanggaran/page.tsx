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

type PelanggaranRecord = {
  id: string;
  type: "pelanggaran";
  nama_pelanggaran: string;
  poin_pelanggaran: number;
  created_at: string;
};

function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function PelanggaranPage() {
  const [siswaData, setSiswaData] = useState<SiswaRecord[]>([]);
  const [pelanggaranData, setPelanggaranData] = useState<PelanggaranRecord[]>([]);
  const [formSiswaId, setFormSiswaId] = useState("");
  const [formSiswaQuery, setFormSiswaQuery] = useState("");
  const [formPelanggaranId, setFormPelanggaranId] = useState("");
  const [formPelanggaranQuery, setFormPelanggaranQuery] = useState("");
  const [formPelanggaranNama, setFormPelanggaranNama] = useState("");
  const [formPelanggaranPoin, setFormPelanggaranPoin] = useState("");
  const [confirmDeletePelanggaranIds, setConfirmDeletePelanggaranIds] = useState<Record<string, boolean>>({});
  const [notif, setNotif] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [manualInputOpen, setManualInputOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanSession, setScanSession] = useState(0);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "success" | "error">("idle");
  const [manualBarcode, setManualBarcode] = useState("");
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const scannerRunningRef = useRef<boolean>(false);

  useEffect(() => {
    let isActive = true;
    const fetchAll = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [{ data: pelanggaranRows, error: pelanggaranError }, { data: siswaRows, error: siswaError }] =
          await Promise.all([
            supabase
              .from("records")
              .select("*")
              .eq("type", "pelanggaran")
              .order("poin_pelanggaran", { ascending: true }),
            supabase.from("records").select("*").eq("type", "siswa").order("poin", { ascending: false }),
          ]);
        if (pelanggaranError) throw pelanggaranError;
        if (siswaError) throw siswaError;
        if (!isActive) return;
        setPelanggaranData((pelanggaranRows as PelanggaranRecord[]) || []);
        setSiswaData((siswaRows as SiswaRecord[]) || []);
      } catch {
        if (!isActive) return;
        setLoadError("Gagal memuat data. Periksa koneksi dan konfigurasi Supabase.");
        setPelanggaranData([]);
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
      const [{ data: pelanggaranRows, error: pelanggaranError }, { data: siswaRows, error: siswaError }] =
        await Promise.all([
          supabase
            .from("records")
            .select("*")
            .eq("type", "pelanggaran")
            .order("poin_pelanggaran", { ascending: true }),
          supabase.from("records").select("*").eq("type", "siswa").order("poin", { ascending: false }),
        ]);
      if (pelanggaranError) throw pelanggaranError;
      if (siswaError) throw siswaError;
      setPelanggaranData((pelanggaranRows as PelanggaranRecord[]) || []);
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

  const handleScanBarcode = useCallback(
    (barcodeId: string) => {
      const siswa = siswaData.find((item) => item.barcode_id === barcodeId);
      if (!siswa) {
        setScanStatus("error");
        showNotif("Barcode tidak ditemukan");
        return;
      }
      setFormSiswaId(siswa.id);
      setFormSiswaQuery(`${siswa.nama} (${siswa.kelas})`);
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
      const scanner = new Html5Qrcode("qr-reader-pelanggaran");
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

  const handleAddPelanggaranKeSiswa = async (e: React.FormEvent) => {
    e.preventDefault();
    const siswa =
      siswaData.find((item) => item.id === formSiswaId) ??
      siswaData.find(
        (item) =>
          `${item.nama} (${item.kelas})`.toLowerCase() === formSiswaQuery.toLowerCase().trim(),
      );
    const pelanggaran = pelanggaranData.find((item) => item.id === formPelanggaranId);
    if (!siswa) {
      showNotif("Pilih siswa terlebih dahulu");
      return;
    }
    if (!pelanggaran) {
      showNotif("Pilih jenis pelanggaran");
      return;
    }

    const ok = await handleUpdateSiswa(siswa, {
      poin: Math.max(0, siswa.poin + pelanggaran.poin_pelanggaran),
    });

    if (ok) {
      await supabase.from("pelanggaran_siswa_log").insert({
        siswa_id: siswa.id,
        nama: siswa.nama,
        kelas: siswa.kelas,
        nama_pelanggaran: pelanggaran.nama_pelanggaran,
        poin_pelanggaran: pelanggaran.poin_pelanggaran,
        status_hari_ini: siswa.status_hari_ini || "hadir",
        tanggal: getTodayDate(),
        created_at: new Date().toISOString(),
      });
      showNotif(`${siswa.nama}: ${pelanggaran.nama_pelanggaran} (${pelanggaran.poin_pelanggaran} poin)`);
      setFormSiswaId("");
      setFormSiswaQuery("");
      setFormPelanggaranId("");
      setFormPelanggaranQuery("");
    } else {
      showNotif("Gagal mencatat pelanggaran");
    }
  };

  const handleAddPelanggaran = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pelanggaranData.length >= 50) {
      showNotif("Maksimal 50 pelanggaran tercapai");
      return;
    }
    const nama = formPelanggaranNama.trim();
    const poinInput = Number.parseInt(formPelanggaranPoin, 10);
    if (!nama || Number.isNaN(poinInput) || poinInput <= 0) {
      showNotif("Poin pelanggaran harus negatif");
      return;
    }
    const poin = -Math.abs(poinInput);

    const { error } = await supabase.from("records").insert({
      id: Date.now().toString(),
      type: "pelanggaran",
      nama_pelanggaran: nama,
      poin_pelanggaran: poin,
    });

    if (!error) {
      setFormPelanggaranNama("");
      setFormPelanggaranPoin("");
      setAddModalOpen(false);
      showNotif(`Pelanggaran "${nama}" (${poin}) ditambahkan`);
      refreshData();
    } else {
      showNotif(`Gagal menambahkan pelanggaran: ${error.message}`);
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
      showNotif("Gagal menghapus");
    }
  };

  return (
    <>
      <div className="absensi-shell fade-in">
        <div className="glass-card rounded-2xl p-4 md:p-6 mb-4 md:mb-6 premium-shadow absensi-hero dashboard-hero">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h1 className="font-black tracking-tight mb-2" style={{ fontSize: "2rem", color: "#111827" }}>
                Kelola Daftar Pelanggaran
              </h1>
              <p style={{ fontSize: "0.9rem", color: "#0f172a" }}>
                Tambah dan atur jenis pelanggaran beserta poinnya.
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
              <h2 className="card__title">Catat Pelanggaran Siswa</h2>
              <p className="card__desc">Cari siswa lalu pilih jenis pelanggaran.</p>
            </div>
            <span className="badge badge--red">Pelanggaran</span>
          </div>

          <form className="form" onSubmit={handleAddPelanggaranKeSiswa}>
            <div className="two-col">
              <button className="btn btn--primary" type="button" onClick={() => setScanModalOpen(true)}>
                Scan Barcode
              </button>
            </div>

            <div className="field">
              <label className="label" htmlFor="namaSiswa">
                Nama Siswa
              </label>
              <input
                className="input"
                id="namaSiswa"
                placeholder="Pilih dari daftar atau ketik..."
                type="text"
                list="siswa-options"
                value={formSiswaQuery}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormSiswaQuery(value);
                  const match = siswaData.find((item) => `${item.nama} (${item.kelas})` === value);
                  setFormSiswaId(match?.id ?? "");
                }}
                required
              />
              <datalist id="siswa-options">
                {siswaData.map((siswa) => (
                  <option key={siswa.id} value={`${siswa.nama} (${siswa.kelas})`} />
                ))}
              </datalist>
            </div>


            <div className="field">
              <label className="label" htmlFor="jenisPelanggaran">
                Jenis Pelanggaran
              </label>
              <input
                className="input"
                id="jenisPelanggaran"
                placeholder="Pilih pelanggaran..."
                type="text"
                list="pelanggaran-options"
                value={formPelanggaranQuery}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormPelanggaranQuery(value);
                  const match = pelanggaranData.find(
                    (item) => `${item.nama_pelanggaran} (${item.poin_pelanggaran})` === value,
                  );
                  setFormPelanggaranId(match?.id ?? "");
                }}
                required
              />
              <datalist id="pelanggaran-options">
                {pelanggaranData.map((pelanggaran) => (
                  <option
                    key={pelanggaran.id}
                    value={`${pelanggaran.nama_pelanggaran} (${pelanggaran.poin_pelanggaran})`}
                  />
                ))}
              </datalist>
            </div>

            <div className="actions">
              <button className="btn btn--danger" type="submit" disabled={isLoading}>
                Simpan Pelanggaran
              </button>
            </div>
          </form>
        </article>

        <article className="card card--full">
          <div className="card__head">
            <div>
              <h2 className="card__title">Daftar Pelanggaran</h2>
              <p className="card__desc">Isi nama pelanggaran dan poin negatif.</p>
            </div>
            <button className="btn btn--danger" type="button" onClick={() => setAddModalOpen(true)}>
              + Tambah Pelanggaran
            </button>
          </div>

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
                      className={`icon-btn icon-btn--danger ${confirmDeletePelanggaranIds[pelanggaran.id] ? "is-confirm" : ""}`}
                      title={confirmDeletePelanggaranIds[pelanggaran.id] ? "Klik untuk hapus" : "Hapus"}
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
                      {confirmDeletePelanggaranIds[pelanggaran.id] ? (
                        <span className="icon-btn__label">Yakin?</span>
                      ) : (
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M6 7h12l-1 12H7L6 7Z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinejoin="round"
                          />
                          <path d="M9 7V5h6v2M10 11v5M14 11v5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </div>
      <button className="fab-add" type="button" onClick={() => setAddModalOpen(true)} aria-label="Tambah pelanggaran">
        +
      </button>
      {addModalOpen ? (
        <div className="modal-overlay" onClick={() => setAddModalOpen(false)}>
          <div className="glass-card modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="card__head">
              <div>
                <h2 className="card__title">Tambah Pelanggaran</h2>
                <p className="card__desc">Isi nama pelanggaran dan poin negatif.</p>
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
                <div className="input-prefix">
                  <span className="input-prefix__icon">-</span>
                  <input
                    className="input input-prefix__field"
                    id="poinPelanggaran"
                    type="number"
                    placeholder="10"
                    value={formPelanggaranPoin}
                    onChange={(e) => setFormPelanggaranPoin(e.target.value)}
                    min={0}
                    required
                  />
                </div>
              </div>

              <div className="actions">
                <button className="btn btn--danger" type="submit" disabled={isLoading}>
                  Tambah Pelanggaran
                </button>
                <button className="btn btn--ghost" type="button" onClick={() => setAddModalOpen(false)}>
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
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
              <div id="qr-reader-pelanggaran" style={{ width: "100%", height: "100%" }} />
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

