"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Props = {
  children: React.ReactNode;
};

export default function AdminLayout({ children }: Props) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (href: string) => pathname === href;

  return (
    <div className="min-h-full w-full">
      <div className="gradient-bg min-h-full">
        <div
          className="admin-app"
          style={
            {
              ["--admin-primary"]: "#2563eb",
              ["--admin-secondary"]: "#059669",
              ["--admin-text"]: "#0f172a",
            } as React.CSSProperties
          }
        >
          <aside className={`admin-sidebar ${sidebarOpen ? "is-open" : ""}`}>
            <div className="brand">
              <div className="brand__logo">LOGO</div>
              <div className="brand__text">
                <div className="brand__title">Panel Admin</div>
                <div className="brand__sub">Absensi - Poin - Pelanggaran</div>
              </div>
            </div>

            <nav className="nav">
              <Link className={`nav__item ${isActive("/") ? "nav__item--active" : ""}`} href="/">
                <span className="nav__icon">DM</span>
                <span>Data Master</span>
              </Link>
              <Link
                className={`nav__item ${isActive("/admin/absensi") ? "nav__item--active" : ""}`}
                href="/admin/absensi"
              >
                <span className="nav__icon">ABS</span>
                <span>Operational Absensi</span>
              </Link>
              <Link
                className={`nav__item ${isActive("/admin/siswa") ? "nav__item--active" : ""}`}
                href="/admin/siswa"
              >
                <span className="nav__icon">SIS</span>
                <span>Kelola Siswa</span>
              </Link>
              <Link
                className={`nav__item ${isActive("/admin/pelanggaran") ? "nav__item--active" : ""}`}
                href="/admin/pelanggaran"
              >
                <span className="nav__icon">PLG</span>
                <span>Pelanggaran</span>
              </Link>
              <Link
                className={`nav__item ${isActive("/admin/poin") ? "nav__item--active" : ""}`}
                href="/admin/poin"
              >
                <span className="nav__icon">POI</span>
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
            <div className="mobile-topbar">
              <div className="mobile-topbar__title">Panel Admin</div>
              <button
                className="mobile-topbar__btn"
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Buka menu"
              >
                Menu
              </button>
            </div>
            {children}
          </main>

          {sidebarOpen ? (
            <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

