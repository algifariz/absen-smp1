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

function generateBarcodeId() {
  return `STD${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
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
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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

  const pageSizeFinal = pageSize >= filteredSiswa.length ? filteredSiswa.length || 1 : pageSize;
  const totalPages = Math.max(1, Math.ceil(filteredSiswa.length / pageSizeFinal));
  const pagedSiswa = useMemo(() => {
    if (filteredSiswa.length === 0) return [];
    const start = (currentPage - 1) * pageSizeFinal;
    return filteredSiswa.slice(start, start + pageSizeFinal);
  }, [currentPage, filteredSiswa, pageSizeFinal]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedKelas, pageSize, siswaData.length]);

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
    const exists = siswaData.some(
      (siswa) => siswa.nama.trim().toLowerCase() === nama.toLowerCase() && siswa.kelas === kelas,
    );
    if (exists) {
      showNotif("Siswa dengan nama dan kelas yang sama sudah ada");
      return;
    }

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
    if (error) {
      showNotif("Gagal menghapus");
      return;
    }

    await supabase.from("absensi_log").delete().eq("siswa_id", siswa.id);
    await supabase.from("pelanggaran_log").delete().eq("siswa_id", siswa.id);
    showNotif(`${siswa.nama} telah dihapus`);
    refreshData();
  };

  const handleSetHadir = async (siswa: SiswaRecord) => {
    const today = getTodayDate();
    if (siswa.absen_hari_ini === today && siswa.status_hari_ini === "hadir") {
      showNotif(`${siswa.nama} sudah hadir hari ini`);
      return;
    }
    const ok = await handleUpdateSiswa(siswa, {
      kehadiran: siswa.kehadiran + 1,
      absen_hari_ini: today,
      status_hari_ini: "hadir",
    });
    if (ok) {
      showNotif(`${siswa.nama} dicatat hadir`);
      await supabase.from("absensi_log").insert({
        siswa_id: siswa.id,
        nama: siswa.nama,
        kelas: siswa.kelas,
        barcode_id: siswa.barcode_id,
        tanggal: today,
        status_hari_ini: "hadir",
        created_at: new Date().toISOString(),
      });
    } else {
      showNotif("Gagal menyimpan status");
    }
  };

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
      const { error: logError } = await supabase.from("pelanggaran_siswa_log").insert({
        siswa_id: siswa.id,
        nama: siswa.nama,
        kelas: siswa.kelas,
        nama_pelanggaran: namaPelanggaran,
        poin_pelanggaran: poinPenalti,
        status_hari_ini: siswa.status_hari_ini || "hadir",
        tanggal: new Date().toISOString().slice(0, 10),
        created_at: new Date().toISOString(),
      });
      if (logError) {
        showNotif("Pelanggaran tercatat, tetapi gagal simpan ke log laporan");
      }
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

  const handleSetStatus = async (
    siswa: SiswaRecord,
    status: "izin" | "sakit" | "alfa",
  ) => {
    const today = getTodayDate();
    const ok = await handleUpdateSiswa(siswa, {
      absen_hari_ini: today,
      status_hari_ini: status,
    });
    if (ok) {
      showNotif(`${siswa.nama} dicatat ${status}`);
      await supabase.from("absensi_log").insert({
        siswa_id: siswa.id,
        nama: siswa.nama,
        kelas: siswa.kelas,
        barcode_id: siswa.barcode_id,
        tanggal: today,
        status_hari_ini: status,
        created_at: new Date().toISOString(),
      });
    } else {
      showNotif("Gagal menyimpan status");
    }
  };

  const handleDownloadCard = useCallback(async (siswa: SiswaRecord) => {
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
      }, "image/png");
    };
    qrImg.src = qrDataUrl;
  }, []);

  const handleExportCsv = useCallback(() => {
    const header = ["nama", "kelas"];
    const rows = siswaData.map((siswa) => [siswa.nama, siswa.kelas]);
    const escapeCsv = (value: string) => {
      const safe = value.replace(/"/g, '""');
      return `"${safe}"`;
    };
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => escapeCsv(String(cell ?? ""))).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `data_siswa_${getTodayDate()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [siswaData]);

  const handleImportCsv = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
        if (lines.length === 0) {
          showNotif("File kosong");
          return;
        }

        const delimiter = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
        const parseRow = (line: string) =>
          line
            .split(delimiter)
            .map((cell) => cell.trim().replace(/^"|"$/g, ""));

        const header = parseRow(lines[0]).map((h) => h.toLowerCase());
        const nameIndex = header.indexOf("nama");
        const kelasIndex = header.indexOf("kelas");
        if (nameIndex === -1 || kelasIndex === -1) {
          showNotif("Header harus ada kolom nama dan kelas");
          return;
        }

        const existingKeys = new Set(
          siswaData.map((siswa) => `${siswa.nama.trim().toLowerCase()}|${siswa.kelas}`),
        );
        const payload = lines.slice(1).map((line) => {
          const cells = parseRow(line);
          const nama = (cells[nameIndex] || "").trim();
          const kelas = (cells[kelasIndex] || "").trim().toUpperCase();
          if (!nama || !kelas) return null;
          const key = `${nama.toLowerCase()}|${kelas}`;
          if (existingKeys.has(key)) return null;
          existingKeys.add(key);
          return {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            type: "siswa",
            nama,
            kelas,
            poin: 0,
            kehadiran: 0,
            dibuat: new Date().toISOString(),
            barcode_id: generateBarcodeId(),
            absen_hari_ini: null,
          };
        });

        const rows = payload.filter(Boolean) as Array<{
          id: string;
          type: "siswa";
          nama: string;
          kelas: string;
          poin: number;
          kehadiran: number;
          dibuat: string;
          barcode_id: string;
          absen_hari_ini: null;
        }>;

        if (rows.length === 0) {
          showNotif("Tidak ada data valid untuk diimport");
          return;
        }

        const { error } = await supabase.from("records").insert(rows);
        if (error) {
          showNotif(`Gagal import: ${error.message}`);
          return;
        }
        showNotif(`Berhasil import ${rows.length} siswa`);
        refreshData();
      } catch {
        showNotif("Gagal membaca file");
      } finally {
        if (importInputRef.current) {
          importInputRef.current.value = "";
        }
      }
    },
    [refreshData, showNotif],
  );

  return (
    <>
      <div className="absensi-shell fade-in">
        <div className="glass-card rounded-2xl p-4 md:p-6 mb-4 md:mb-6 premium-shadow absensi-hero dashboard-hero">
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

              <article className="card card--full siswa-card siswa-card--compact">
                <div className="card__head siswa-head">
                  <div className="siswa-head__title">
                    <h2 className="card__title">Daftar Siswa</h2>
                    <p className="card__desc" style={{ color: "#0f172a" }}>
                      Gunakan filter kelas untuk mempercepat pencarian.
                    </p>
                  </div>
                  <div className="siswa-toolbar">
                    <button className="btn btn--primary" type="button" onClick={() => setAddModalOpen(true)}>
                      + Tambah Siswa
                    </button>
                    <div className="actions siswa-actions">
                      <button className="btn btn--ghost btn--sm" type="button" onClick={handleExportCsv}>
                        Export Excel
                      </button>
                      <button
                        className="btn btn--ghost btn--sm"
                        type="button"
                        onClick={() => importInputRef.current?.click()}
                      >
                        Import Excel
                      </button>
                    </div>
                  </div>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImportCsv(file);
                    }}
                  />
                  <div className="segmented siswa-segmented" role="tablist" aria-label="Filter kelas">
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
                  <table className="table table--cards">
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
                        pagedSiswa.map((siswa) => {
                          const sudahAbsen = isClientReady && siswa.absen_hari_ini === todayDate;
                          const statusValue =
                            sudahAbsen && siswa.status_hari_ini ? siswa.status_hari_ini : null;
                          const statusKnown = isClientReady;
                          const statusLabel = !statusKnown
                            ? "Memuat..."
                            : sudahAbsen
                              ? statusValue === "izin"
                                ? "Izin"
                                : statusValue === "sakit"
                                  ? "Sakit"
                                  : statusValue === "alfa"
                                    ? "Alfa"
                                  : "Hadir Hari Ini"
                              : "Belum Absen";
                          const statusVariant = !statusKnown
                            ? "belum"
                            : sudahAbsen
                              ? statusValue === "izin"
                                ? "izin"
                                : statusValue === "sakit"
                                  ? "sakit"
                                  : statusValue === "alfa"
                                    ? "alfa"
                                    : "hadir"
                              : "belum";
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
                                  <span className={`pill pill--${statusVariant}`}>
                                    <span className={`dot dot--${statusVariant}`} />
                                    {statusLabel}
                                  </span>
                                </td>
                                <td className="td-right" data-label="Aksi">
                                  <div className="row-actions">
                                    <button
                                      className={`btn btn--sm btn--icon ${
                                        statusValue === "hadir" ? "btn--success" : "btn--ghost"
                                      }`}
                                      type="button"
                                      onClick={() => handleSetHadir(siswa)}
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
                                      Hadir
                                    </button>
                                    <button
                                      className={`btn btn--sm ${statusValue === "izin" ? "btn--warning" : "btn--ghost"}`}
                                      type="button"
                                      onClick={() => handleSetStatus(siswa, "izin")}
                                    >
                                      Izin
                                    </button>
                                    <button
                                      className={`btn btn--sm ${statusValue === "sakit" ? "btn--info" : "btn--ghost"}`}
                                      type="button"
                                      onClick={() => handleSetStatus(siswa, "sakit")}
                                    >
                                      Sakit
                                    </button>
                                    <button
                                      className={`btn btn--sm ${statusValue === "alfa" ? "btn--danger" : "btn--ghost"}`}
                                      type="button"
                                      onClick={() => handleSetStatus(siswa, "alfa")}
                                    >
                                      Alfa
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
                <div className="pagination">
                  <div className="pagination__info">
                    Menampilkan {filteredSiswa.length === 0 ? 0 : (currentPage - 1) * pageSizeFinal + 1}-
                    {Math.min(currentPage * pageSizeFinal, filteredSiswa.length)} dari {filteredSiswa.length}
                  </div>
                  <div className="pagination__controls">
                    <button
                      className="btn btn--ghost btn--sm"
                      type="button"
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      Sebelumnya
                    </button>
                    <span className="pagination__page">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      className="btn btn--ghost btn--sm"
                      type="button"
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Berikutnya
                    </button>
                    <div className="pagination__size">
                      <label htmlFor="page-size" className="pagination__label">
                        Tampilkan
                      </label>
                      <select
                        id="page-size"
                        className="input pagination__select"
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={filteredSiswa.length || 10}>Semua</option>
                      </select>
                    </div>
                  </div>
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
                  handleDownloadCard(barcodeTarget);
                }}
              >
                Download Kartu
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

