import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthBootstrap from "./auth-bootstrap";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sistem Poin Kelas",
  description: "Sistem poin dan absensi siswa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`} suppressHydrationWarning>
        <AuthBootstrap />
        {children}
      </body>
    </html>
  );
}
