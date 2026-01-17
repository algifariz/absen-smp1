"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type PelanggaranRecord = {
  id: string;
  type: "pelanggaran";
  nama_pelanggaran: string;
  poin_pelanggaran: number;
  created_at: string;
};

export default function PelanggaranPage() {
  const [pelanggaranData, setPelanggaranData] = useState<PelanggaranRecord[]>([]);
  const [formPelanggaranNama, setFormPelanggaranNama] = useState("");
  const [formPelanggaranPoin, setFormPelanggaranPoin] = useState("");
  const [confirmDeletePelanggaranIds, setConfirmDeletePelanggaranIds] = useState<Record<string, boolean>>({});
  const [notif, setNotif] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    const fetchAll = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const { data, error } = await supabase
          .from("records")
          .select("*")
          .eq("type", "pelanggaran")
          .order("poin_pelanggaran", { ascending: true });
        if (error) throw error;
        if (!isActive) return;
        setPelanggaranData((data as PelanggaranRecord[]) || []);
      } catch {
        if (!isActive) return;
        setLoadError("Gagal memuat data. Periksa koneksi dan konfigurasi Supabase.");
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

  const showNotif = useCallback((message: string) => {
    setNotif(message);
  }, []);

  const refreshData = useCallback(async () => {
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("records")
        .select("*")
        .eq("type", "pelanggaran")
        .order("poin_pelanggaran", { ascending: true });
      if (error) throw error;
      setPelanggaranData((data as PelanggaranRecord[]) || []);
    } catch {
      setLoadError("Gagal memuat data. Periksa koneksi dan konfigurasi Supabase.");
      showNotif("Gagal memuat data terbaru");
    }
  }, [showNotif]);

  const handleAddPelanggaran = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pelanggaranData.length >= 50) {
      showNotif("Maksimal 50 pelanggaran tercapai");
      return;
    }
    const nama = formPelanggaranNama.trim();
    const poin = Number.parseInt(formPelanggaranPoin, 10);
    if (!nama || Number.isNaN(poin) || poin > 0) {
      showNotif("Poin pelanggaran harus negatif");
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
        <div className="glass-card rounded-2xl p-4 md:p-6 mb-4 md:mb-6 premium-shadow absensi-hero">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h1 className="font-black tracking-tight mb-2" style={{ fontSize: "2rem", color: "#0f172a" }}>
                Kelola Daftar Pelanggaran
              </h1>
              <p style={{ fontSize: "0.9rem", color: "#64748b" }}>
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
              <button className="btn btn--danger" type="submit" disabled={isLoading}>
                Tambah Pelanggaran
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
                      {confirmDeletePelanggaranIds[pelanggaran.id] ? "Yakin?" : "Hapus"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </div>
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

