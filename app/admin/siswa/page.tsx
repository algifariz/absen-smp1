"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export default function KelolaSiswaPage() {
  const [siswaData, setSiswaData] = useState<SiswaRecord[]>([]);
  const [pelanggaranData, setPelanggaranData] = useState<PelanggaranRecord[]>([]);
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<Record<string, boolean>>({});
  const [editingNama, setEditingNama] = useState<Record<string, string>>({});
  const [selectedKelas, setSelectedKelas] = useState<string>("all");
  const [notif, setNotif] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [todayDate] = useState<string>(getTodayDate());
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [barcodeTarget, setBarcodeTarget] = useState<SiswaRecord | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  // Form State
  const [formNama, setFormNama] = useState("");
  const [formKelas, setFormKelas] = useState("");
  const addSiswaRef = useRef<HTMLInputElement | null>(null);

  const isClientReady = todayDate !== "";

  const kelasList = useMemo(() => {
    const kelasSet = new Set(siswaData.map((s) => s.kelas).filter(Boolean));
    return Array.from(kelasSet).sort();
  }, [siswaData]);

  const filteredSiswa = useMemo(() => {
    if (selectedKelas === "all") return siswaData;
    return siswaData.filter((s) => s.kelas === selectedKelas);
  }, [selectedKelas, siswaData]);

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
    const timer = setTimeout(() => setNotif(null), 3000);
    return () => clearTimeout(timer);
  }, [notif]);

  useEffect(() => {
    if (!addModalOpen) return;
    const timer = setTimeout(() => {
      addSiswaRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [addModalOpen]);

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
      showNotif("Gagal memuat data terbaru");
    }
  }, [showNotif]);

  const handleAddSiswa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (siswaData.length >= 999) {
      showNotif("Maksimal 999 siswa tercapai!");
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
      setAddModalOpen(false);
      showNotif(`${nama} (${kelas}) berhasil ditambahkan!`);
      refreshData();
    } else {
      showNotif(`Gagal menambahkan siswa: ${error.message}`);
    }
  };

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
      showNotif("Gagal menghapus");
    }
  };

  const processAbsensi = useCallback(
    async (barcodeId: string) => {
      const siswa = siswaData.find((s) => s.barcode_id === barcodeId);
      if (!siswa) {
        showNotif("Barcode tidak ditemukan");
        return;
      }
      const today = getTodayDate();
      if (siswa.absen_hari_ini === today) {
        showNotif(`${siswa.nama} sudah absen hari ini`);
        return;
      }

      const ok = await handleUpdateSiswa(siswa, {
        kehadiran: siswa.kehadiran + 1,
        absen_hari_ini: today,
      });

      if (ok) {
        showNotif(`${siswa.nama} berhasil absen`);
      } else {
        showNotif("Gagal mencatat absensi");
      }
    },
    [siswaData, handleUpdateSiswa, showNotif],
  );

  const handlePlusPoin = async (siswa: SiswaRecord) => {
    const today = getTodayDate();
    if (siswa.absen_hari_ini !== today) {
      showNotif(`${siswa.nama} belum absen hari ini`);
      return;
    }
    const ok = await handleUpdateSiswa(siswa, { poin: siswa.poin + 10 });
    if (ok) {
      showNotif(`+10 poin untuk ${siswa.nama}`);
    } else {
      showNotif("Gagal menambah poin");
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
      showNotif(`${siswa.nama}: ${namaPelanggaran} (${poinPenalti} poin)`);
      await supabase.from("pelanggaran_log").insert({
        siswa_id: siswa.id,
        nama: siswa.nama,
        kelas: siswa.kelas,
        nama_pelanggaran: namaPelanggaran,
        poin_pelanggaran: poinPenalti,
        tanggal: new Date().toISOString().slice(0, 10),
        created_at: new Date().toISOString(),
      });
    } else {
      showNotif("Gagal mencatat pelanggaran");
    }
  };

  const handleEditNama = async (siswa: SiswaRecord) => {
    const newName = (editingNama[siswa.id] || "").trim();
    if (!newName || newName === siswa.nama) return;
    const ok = await handleUpdateSiswa(siswa, { nama: newName });
    if (ok) {
      showNotif(`Nama diubah menjadi "${newName}"`);
    } else {
      showNotif("Gagal mengubah nama");
    }
  };

  return (
    <>
      <div className="absensi-shell fade-in">
        <div className="glass-card rounded-2xl p-4 md:p-6 mb-4 md:mb-6 premium-shadow absensi-hero">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h1 className="font-black tracking-tight mb-2" style={{ fontSize: "2rem", color: "#0f172a" }}>
                Kelola Siswa
              </h1>
              <p style={{ fontSize: "0.9rem", color: "#0f172a" }}>
                Aksi cepat: absensi, tambah poin, catat pelanggaran.
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

              <article className="card card--full">
                <div className="card__head">
                  <div>
                    <h2 className="card__title">Daftar Siswa</h2>
                    <p className="card__desc" style={{ color: "#0f172a" }}>
                      Gunakan filter kelas untuk mempercepat pencarian.
                    </p>
                  </div>
                  <button className="btn btn--primary" type="button" onClick={() => setAddModalOpen(true)}>
                    + Tambah Siswa
                  </button>
                  <div className="segmented" role="tablist" aria-label="Filter kelas">
                    <button
                      className={`segmented__btn ${selectedKelas === "all" ? "is-active" : ""}`}
                      type="button"
                      onClick={() => setSelectedKelas("all")}
                    >
                      Semua ({siswaData.length})
                    </button>
                    {kelasList.map((kelas) => {
                      const count = siswaData.filter((s) => s.kelas === kelas).length;
                      return (
                        <button
                          key={kelas}
                          className={`segmented__btn ${selectedKelas === kelas ? "is-active" : ""}`}
                          type="button"
                          onClick={() => setSelectedKelas(kelas)}
                        >
                          {kelas} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Nama</th>
                        <th>Kelas</th>
                        <th>Saldo Poin</th>
                        <th>Status</th>
                        <th className="th-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading ? (
                        <tr>
                          <td colSpan={5} className="table-empty">Memuat data siswa...</td>
                        </tr>
                      ) : filteredSiswa.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="table-empty">Belum ada siswa.</td>
                        </tr>
                      ) : (
                        filteredSiswa.map((siswa) => {
                          const sudahAbsen = isClientReady && siswa.absen_hari_ini === todayDate;
                          const statusKnown = isClientReady;
                          const statusLabel = !statusKnown
                            ? "Memuat..."
                            : sudahAbsen
                              ? "Hadir Hari Ini"
                              : "Belum Absen";
                          const statusVariant = !statusKnown
                            ? "warn"
                            : sudahAbsen
                              ? "ok"
                              : "warn";
                          const pointClass = siswa.poin > 0 ? "chip--green" : siswa.poin < 0 ? "chip--red" : "chip--muted";
                          return (
                            <Fragment key={siswa.id}>
                              <tr>
                                <td data-label="Nama">
                                  <div className="w-full text-right text-left">
                                    <input
                                      className="table-input text-right text-left"
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
                                    />
                                    <div className="list__meta">{siswa.barcode_id}</div>
                                  </div>
                                </td>
                                <td data-label="Kelas">{siswa.kelas || "-"}</td>
                                <td data-label="Saldo Poin">
                                  <span className={`chip ${pointClass}`}>{siswa.poin}</span>
                                </td>
                                <td data-label="Status">
                                  <span className="pill">
                                    <span className={`dot dot--${statusVariant}`} />
                                    {statusLabel}
                                  </span>
                                </td>
                                <td className="td-right" data-label="Aksi">
                                  <div className="row-actions">
                                    <button
                                      className="btn btn--ghost btn--sm btn--icon"
                                      type="button"
                                      onClick={() => processAbsensi(siswa.barcode_id)}
                                    >
                                      <span className="btn__icon" aria-hidden="true">
                                        <svg viewBox="0 0 24 24">
                                          <path
                                            d="M5 7.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="1.6"
                                          />
                                          <path d="M8 12h8" fill="none" stroke="currentColor" strokeWidth="1.6" />
                                        </svg>
                                      </span>
                                      Absensi
                                    </button>
                                    <button
                                      className="btn btn--ghost btn--sm btn--icon"
                                      type="button"
                                      onClick={() => {
                                        setBarcodeTarget(siswa);
                                        setBarcodeModalOpen(true);
                                      }}
                                    >
                                      <span className="btn__icon" aria-hidden="true">
                                        <svg viewBox="0 0 24 24">
                                          <path
                                            d="M5 6h14v4H5V6Zm0 8h14v4H5v-4Z"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="1.6"
                                          />
                                          <path d="M8 8h2M8 16h2M14 8h2M14 16h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                        </svg>
                                      </span>
                                      Barcode
                                    </button>
                                    <button
                                      className="btn btn--primary btn--sm btn--icon"
                                      type="button"
                                      onClick={() => handlePlusPoin(siswa)}
                                    >
                                      <span className="btn__icon" aria-hidden="true">
                                        <svg viewBox="0 0 24 24">
                                          <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.8" />
                                        </svg>
                                      </span>
                                       Poin
                                    </button>
                                    <button
                                      className="btn btn--danger btn--sm btn--icon"
                                      type="button"
                                      onClick={() => {
                                        setConfirmDeleteIds((prev) => ({
                                          ...prev,
                                          [`panel-${siswa.id}`]: !prev[`panel-${siswa.id}`],
                                        }));
                                      }}
                                    >
                                      <span className="btn__icon" aria-hidden="true">
                                        <svg viewBox="0 0 24 24">
                                          <path
                                            d="M12 3.5 21 19.5H3L12 3.5Z"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="1.6"
                                          />
                                          <path d="M12 9v5M12 17.2h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                        </svg>
                                      </span>
                                      Pelanggaran
                                    </button>
                                    <button
                                      className={`icon-btn icon-btn--danger ${confirmDeleteIds[siswa.id] ? "is-confirm" : ""}`}
                                      title={confirmDeleteIds[siswa.id] ? "Klik untuk hapus" : "Hapus"}
                                      type="button"
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
                                      {confirmDeleteIds[siswa.id] ? (
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
                                </td>
                              </tr>
                              {confirmDeleteIds[`panel-${siswa.id}`] ? (
                                <tr className="table-panel">
                                  <td colSpan={5}>
                                    <div className="violation-panel">
                                      <div className="panel-title">Pilih jenis pelanggaran</div>
                                      {pelanggaranData.length === 0 ? (
                                        <div className="muted">Belum ada pelanggaran. Tambahkan pelanggaran terlebih dahulu.</div>
                                      ) : (
                                        <div className="panel-grid">
                                          {pelanggaranData.map((pelanggaran) => (
                                            <button
                                              key={pelanggaran.id}
                                              className="panel-item"
                                              type="button"
                                              onClick={() => {
                                                handlePelanggaran(
                                                  siswa,
                                                  pelanggaran.poin_pelanggaran,
                                                  pelanggaran.nama_pelanggaran,
                                                );
                                                setConfirmDeleteIds((prev) => ({
                                                  ...prev,
                                                  [`panel-${siswa.id}`]: false,
                                                }));
                                              }}
                                            >
                                              <span className="panel-points">{pelanggaran.poin_pelanggaran}</span>
                                              <span>{pelanggaran.nama_pelanggaran}</span>
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                      <button
                                        className="btn btn--ghost btn--sm"
                                        type="button"
                                        onClick={() =>
                                          setConfirmDeleteIds((prev) => ({
                                            ...prev,
                                            [`panel-${siswa.id}`]: false,
                                          }))
                                        }
                                      >
                                        Tutup Panel
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
      </div>
      <button className="fab-add" type="button" onClick={() => setAddModalOpen(true)} aria-label="Tambah siswa">
        +
      </button>
      {addModalOpen ? (
        <div className="modal-overlay" onClick={() => setAddModalOpen(false)}>
          <div className="glass-card modal-card" onClick={(e) => e.stopPropagation()}>
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
                  Simpan Siswa
                </button>
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() => {
                    setFormNama("");
                    setFormKelas("");
                    setAddModalOpen(false);
                  }}
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {barcodeModalOpen && barcodeTarget ? (
        <div className="modal-overlay" onClick={() => setBarcodeModalOpen(false)}>
          <div className="glass-card modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="card__head">
              <div>
                <h2 className="card__title">Barcode Siswa</h2>
                <p className="card__desc">{barcodeTarget.nama}</p>
              </div>
              <span className="badge badge--blue">{barcodeTarget.kelas || "-"}</span>
            </div>
            <div className="glass-card rounded-2xl p-4">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="QR Code" style={{ width: "100%", maxWidth: 240, margin: "0 auto" }} />
              ) : (
                <div className="muted">QR code tidak tersedia.</div>
              )}
              <div className="text-center mt-3 font-semibold">{barcodeTarget.barcode_id}</div>
            </div>
            <div className="actions">
              <button
                className="btn btn--primary"
                type="button"
                onClick={() => {
                  if (!qrDataUrl) return;
                  const link = document.createElement("a");
                  link.download = `QR_${barcodeTarget.nama.replace(/\s+/g, "_")}_${barcodeTarget.barcode_id}.png`;
                  link.href = qrDataUrl;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
              >
                Download QR
              </button>
              <button className="btn btn--ghost" type="button" onClick={() => setBarcodeModalOpen(false)}>
                Tutup
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

