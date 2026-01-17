"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen w-full gradient-bg">
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30">
        <div className="brand flex items-center gap-3">
          <div className="brand__logo">📷</div>
          <div className="font-bold text-slate-900">Panel Admin</div>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          aria-label="Toggle Menu"
        >
          {sidebarOpen ? "✖" : "☰"}
        </button>
      </div>

      <div className="admin-app-layout max-w-[1400px] mx-auto p-4 lg:p-8">
        {/* Sidebar Backdrop (Mobile) */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`
                admin-sidebar fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-in-out
                lg:relative lg:translate-x-0 lg:w-auto lg:h-auto lg:z-auto lg:block
                ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
            `}
        >
          <div className="brand mb-8 hidden lg:flex">
            <div className="brand__logo">📷</div>
            <div className="brand__text">
              <div className="brand__title">Panel Admin</div>
              <div className="brand__sub">Absensi • Poin • Pelanggaran</div>
            </div>
          </div>

          <nav className="nav flex-1 space-y-2 overflow-y-auto">
            <Link
              href="/"
              className={`nav__item ${pathname === "/" ? "nav__item--active" : ""}`}
            >
              <span className="nav__icon">🏠</span>
              <span>Leaderboard (Public)</span>
            </Link>
            <div className="h-4"></div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
              Menu Admin
            </div>
            <Link
              href="/admin/siswa"
              className={`nav__item ${pathname === "/admin/siswa" ? "nav__item--active" : ""}`}
            >
              <span className="nav__icon">👥</span>
              <span>Kelola Siswa</span>
            </Link>
            <Link
              href="/admin/absensi"
              className={`nav__item ${pathname === "/admin/absensi" ? "nav__item--active" : ""}`}
            >
              <span className="nav__icon">🧾</span>
              <span>Operational Absensi</span>
            </Link>
            <Link
              href="/admin/pelanggaran"
              className={`nav__item ${pathname === "/admin/pelanggaran" ? "nav__item--active" : ""}`}
            >
              <span className="nav__icon">⚠️</span>
              <span>Pelanggaran</span>
            </Link>
            <Link
              href="/admin/poin"
              className={`nav__item ${pathname === "/admin/poin" ? "nav__item--active" : ""}`}
            >
              <span className="nav__icon">⭐</span>
              <span>Poin</span>
            </Link>
          </nav>

          <div className="sidebar__footer mt-8">
            <div className="pill justify-center mb-4">
              <span className="dot dot--ok" />
              <span>System Online</span>
            </div>
          </div>
        </aside>

        <main className="admin-main w-full min-w-0">{children}</main>
      </div>
    </div>
  );
}
