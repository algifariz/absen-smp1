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

  const navItems = [
    {
      href: "/admin/dashboard",
      label: "Dashboard",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 12a8 8 0 1 1 16 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path d="M12 12V6.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="12" cy="12" r="1.8" fill="currentColor" />
        </svg>
      ),
    },
    {
      href: "/",
      label: "Data Master",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 7.5c0-.8.7-1.5 1.5-1.5h13c.8 0 1.5.7 1.5 1.5v10c0 .8-.7 1.5-1.5 1.5h-13C4.7 19 4 18.3 4 17.5v-10Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M7 10.5h10M7 13.5h6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      ),
    },
    {
      href: "/admin/absensi",
      label: "Operational Absensi",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6 6.5h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M8 12h8M12 9v6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      ),
    },
    {
      href: "/admin/siswa",
      label: "Kelola Siswa",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 12a3.2 3.2 0 1 0-3.2-3.2A3.2 3.2 0 0 0 12 12Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M5 18.5c0-2.4 3.1-4 7-4s7 1.6 7 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
    {
      href: "/admin/pelanggaran",
      label: "Pelanggaran",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 3.5 21 19.5H3L12 3.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M12 9v5M12 17.2h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      href: "/admin/poin",
      label: "Poin",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 4.5 14.1 9l4.9.6-3.6 3.3.9 4.8-4.3-2.4-4.3 2.4.9-4.8L5 9.6 9.9 9l2.1-4.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      href: "/admin/laporan",
      label: "Laporan",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17V7A1.5 1.5 0 0 1 5 5.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M7.5 10.5h9M7.5 13.5h6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      ),
    },
  ];

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
              <div className="brand__logo" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path
                    d="M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 15v-7A1.5 1.5 0 0 1 5 6.5Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  />
                  <path d="M7.5 10.5h9M7.5 13.5h5" fill="none" stroke="currentColor" strokeWidth="1.7" />
                </svg>
              </div>
              <div className="brand__text">
                <div className="brand__title">Panel Admin</div>
                <div className="brand__sub">Absensi - Poin - Pelanggaran</div>
              </div>
            </div>

            <nav className="nav">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  className={`nav__item ${isActive(item.href) ? "nav__item--active" : ""}`}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="nav__icon">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>

            <div className="sidebar__footer">
              <div className="pill">
                <span className="dot dot--ok" />
                <span>Online</span>
              </div>
              <Link className="btn btn--ghost w-full" href="/">
                Kembali ke Beranda
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
                <span className="burger" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
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

