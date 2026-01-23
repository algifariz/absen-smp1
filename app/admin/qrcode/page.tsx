"use client";

import { useEffect, useMemo, useState } from "react";
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
  status_hari_ini?: "hadir" | "izin" | "sakit" | "alfa" | null;
  created_at: string;
};

type Mode = "personal" | "kelas" | "all";

export default function GenerateQrPage() {
  const [siswaData, setSiswaData] = useState<SiswaRecord[]>([]);
  const [mode, setMode] = useState<Mode>("personal");
  const [selectedKelas, setSelectedKelas] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    let isActive = true;
    const fetchSiswa = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const { data, error } = await supabase
          .from("records")
          .select("*")
          .eq("type", "siswa")
          .order("nama", { ascending: true });
        if (error) throw error;
        if (!isActive) return;
        setSiswaData((data as SiswaRecord[]) || []);
      } catch {
        if (!isActive) return;
        setLoadError("Gagal memuat data siswa. Periksa koneksi dan Supabase.");
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    fetchSiswa();
    return () => {
      isActive = false;
    };
  }, []);

  const kelasList = useMemo(() => {
    const kelasSet = new Set(siswaData.map((s) => s.kelas).filter(Boolean));
    return Array.from(kelasSet).sort();
  }, [siswaData]);

  useEffect(() => {
    if (mode === "kelas" && !selectedKelas && kelasList.length > 0) {
      setSelectedKelas(kelasList[0] || "");
    }
  }, [mode, kelasList, selectedKelas]);

  useEffect(() => {
    if (mode === "personal" && !selectedId && siswaData.length > 0) {
      setSelectedId(siswaData[0]?.id || "");
    }
  }, [mode, selectedId, siswaData]);

  const selectedSiswa = useMemo(() => {
    if (mode === "all") return siswaData;
    if (mode === "kelas") {
      return siswaData.filter((s) => s.kelas === selectedKelas);
    }
    return siswaData.filter((s) => s.id === selectedId);
  }, [mode, siswaData, selectedKelas, selectedId]);

  const groupedByKelas = useMemo(() => {
    if (mode !== "all") return [];
    const map = new Map<string, SiswaRecord[]>();
    siswaData.forEach((siswa) => {
      const key = siswa.kelas || "Tanpa Kelas";
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(siswa);
    });
    return Array.from(map.entries())
      .map(([kelas, items]) => ({ kelas, items }))
      .sort((a, b) => a.kelas.localeCompare(b.kelas, "id"));
  }, [mode, siswaData]);

  const missingQr = useMemo(
    () => selectedSiswa.filter((s) => !qrMap[s.id]),
    [selectedSiswa, qrMap],
  );

  useEffect(() => {
    if (missingQr.length === 0) return;
    let isActive = true;
    const generate = async () => {
      setIsGenerating(true);
      const updates: Record<string, string> = {};
      await Promise.all(
        missingQr.map(async (siswa) => {
          try {
            const url = await QRCode.toDataURL(siswa.barcode_id, {
              width: 260,
              margin: 1,
              color: { dark: "#0f172a", light: "#ffffff" },
            });
            updates[siswa.id] = url;
          } catch {
            updates[siswa.id] = "";
          }
        }),
      );
      if (!isActive) return;
      setQrMap((prev) => ({ ...prev, ...updates }));
      setIsGenerating(false);
    };

    generate();
    return () => {
      isActive = false;
    };
  }, [missingQr]);

  const handleDownloadPng = (siswa: SiswaRecord) => {
    const url = qrMap[siswa.id];
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = `QR_${siswa.nama.replace(/\s+/g, "_")}_${siswa.barcode_id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPdf = () => {
    window.print();
  };

  return (
    <div className="absensi-shell">
      <div className="card card--full qr-hide-print">
        <div className="card__head">
          <div>
            <h1 className="card__title">Generate QR Code</h1>
            <p className="card__desc">Pilih perorangan, per kelas, atau semua siswa untuk cetak QR.</p>
          </div>
          <span className="badge badge--blue">QR Generator</span>
        </div>

        <div className="segmented">
          <button
            className={`segmented__btn ${mode === "personal" ? "is-active" : ""}`}
            type="button"
            onClick={() => setMode("personal")}
          >
            Perorangan
          </button>
          <button
            className={`segmented__btn ${mode === "kelas" ? "is-active" : ""}`}
            type="button"
            onClick={() => setMode("kelas")}
          >
            Per Kelas
          </button>
          <button
            className={`segmented__btn ${mode === "all" ? "is-active" : ""}`}
            type="button"
            onClick={() => setMode("all")}
          >
            Semua Siswa
          </button>
        </div>

        <div className="qr-toolbar">
          {mode === "personal" ? (
            <div className="field qr-field">
              <label className="label" htmlFor="qr-personal">
                Pilih Siswa
              </label>
              <select
                id="qr-personal"
                className="input"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {siswaData.map((siswa) => (
                  <option key={siswa.id} value={siswa.id}>
                    {siswa.nama} - {siswa.kelas}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {mode === "kelas" ? (
            <div className="field qr-field">
              <label className="label" htmlFor="qr-kelas">
                Pilih Kelas
              </label>
              <select
                id="qr-kelas"
                className="input"
                value={selectedKelas}
                onChange={(e) => setSelectedKelas(e.target.value)}
              >
                {kelasList.map((kelas) => (
                  <option key={kelas} value={kelas}>
                    {kelas}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="qr-actions">
            <button className="btn btn--primary" type="button" onClick={handleDownloadPdf}>
              Download PDF
            </button>
            <div className="muted">Gunakan print dialog untuk simpan PDF.</div>
          </div>
        </div>
      </div>

      <div className="card card--full qr-print-area">
        <div className="card__head qr-hide-print">
          <div>
            <h2 className="card__title">
              {mode === "personal"
                ? "QR Code Perorangan"
                : mode === "kelas"
                  ? `QR Code Kelas ${selectedKelas || "-"}`
                  : "QR Code Semua Siswa"}
            </h2>
            <p className="card__desc">
              {selectedSiswa.length} data QR siap diunduh atau dicetak.
            </p>
          </div>
          {isGenerating ? <span className="badge badge--amber">Membuat QR...</span> : null}
        </div>

        {isLoading ? (
          <div className="muted">Memuat data siswa...</div>
        ) : loadError ? (
          <div className="muted">{loadError}</div>
        ) : selectedSiswa.length === 0 ? (
          <div className="muted">Tidak ada data yang bisa ditampilkan.</div>
        ) : (
          <>
            {mode === "all" ? (
              <div className="qr-group-list">
                {groupedByKelas.map((group) => (
                  <section key={group.kelas} className="qr-group">
                    <div className="qr-group__title">Kelas {group.kelas}</div>
                    <div className="qr-grid">
                      {group.items.map((siswa) => (
                        <article key={siswa.id} className="qr-card">
                          <div className="qr-code">
                            {qrMap[siswa.id] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={qrMap[siswa.id]} alt={`QR ${siswa.nama}`} />
                            ) : (
                              <div className="muted">QR belum siap.</div>
                            )}
                          </div>
                          <div className="qr-meta">
                            <div className="qr-name">{siswa.nama}</div>
                            <div className="qr-sub">Kelas {siswa.kelas || "-"}</div>
                            <div className="qr-id">{siswa.barcode_id}</div>
                          </div>
                          <div className="qr-card-actions qr-hide-print">
                            <button
                              className="btn btn--ghost btn--sm"
                              type="button"
                              onClick={() => handleDownloadPng(siswa)}
                              disabled={!qrMap[siswa.id]}
                            >
                              Download PNG
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="qr-grid">
                {selectedSiswa.map((siswa) => (
                  <article key={siswa.id} className="qr-card">
                    <div className="qr-code">
                      {qrMap[siswa.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={qrMap[siswa.id]} alt={`QR ${siswa.nama}`} />
                      ) : (
                        <div className="muted">QR belum siap.</div>
                      )}
                    </div>
                    <div className="qr-meta">
                      <div className="qr-name">{siswa.nama}</div>
                      <div className="qr-sub">Kelas {siswa.kelas || "-"}</div>
                      <div className="qr-id">{siswa.barcode_id}</div>
                    </div>
                    <div className="qr-card-actions qr-hide-print">
                      <button
                        className="btn btn--ghost btn--sm"
                        type="button"
                        onClick={() => handleDownloadPng(siswa)}
                        disabled={!qrMap[siswa.id]}
                      >
                        Download PNG
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
