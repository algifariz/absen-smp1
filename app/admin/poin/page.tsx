"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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

  return (
    <div className="min-h-full w-full">
      <div className="gradient-bg min-h-full">
        <div
          className="admin-app fade-in"
          style={{
            ["--admin-primary"]: "#2563eb",
            ["--admin-secondary"]: "#059669",
            ["--admin-text"]: "#0f172a",
          }}
        >
          <aside className="admin-sidebar">
            <div className="brand">
              <div className="brand__logo">📷</div>
              <div className="brand__text">
                <div className="brand__title">Panel Admin</div>
                <div className="brand__sub">Absensi • Poin • Pelanggaran</div>
              </div>
            </div>

            <nav className="nav">
              <Link className="nav__item" href="/">
                <span className="nav__icon">📦</span>
                <span>Data Master</span>
              </Link>
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
              <Link className="nav__item nav__item--active" href="/admin/poin">
                <span className="nav__icon">⭐</span>
                <span>Poin</span>
              </Link>
            </nav>

            <div className="sidebar__footer">
              <div className="pill">
                <span className="dot dot--ok" />
                <span>Online</span>
              </div>
              <Link className="btn btn--ghost w-full" href="/">
                Kembali ke Admin
              </Link>
            </div>
          </aside>

          <main className="admin-main">
            <div className="absensi-shell">
              <div className="glass-card rounded-2xl p-4 md:p-6 mb-4 md:mb-6 premium-shadow absensi-hero">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <h1 className="font-black tracking-tight mb-2" style={{ fontSize: "2rem", color: "#0f172a" }}>
                      Tambah Poin Custom
                    </h1>
                    <p style={{ fontSize: "0.9rem", color: "#64748b" }}>
                      Tambahkan poin ke siswa tertentu (reward atau penalty).
                    </p>
                  </div>
                  <Link className="btn btn--ghost" href="/">
                    Kembali ke Admin
                  </Link>
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
          </main>
        </div>
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
    </div>
  );
}
