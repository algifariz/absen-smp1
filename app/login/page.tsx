"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/admin/dashboard");
      }
    });
  }, [router]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setErrorMessage("Email atau kata sandi tidak valid.");
      setIsSubmitting(false);
      return;
    }
    router.replace("/admin/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 gradient-bg">
      <div className="glass-card w-full max-w-md p-6 md:p-8">
        <div className="card__head" style={{ alignItems: "center" }}>
          <div>
            <h1 className="card__title">Login Admin</h1>
            <p className="card__desc">Masuk untuk mengelola data siswa.</p>
          </div>
          <span className="badge badge--blue">Admin</span>
        </div>

        <form className="form" onSubmit={handleLogin}>
          <div className="field">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              className="input"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="admin@sekolah.id"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="password">
              Kata Sandi
            </label>
            <input
              className="input"
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="********"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {errorMessage ? <div className="muted">{errorMessage}</div> : null}

          <div className="actions" style={{ marginTop: 8 }}>
            <button
              className="btn btn--primary w-full"
              type="submit"
              disabled={isSubmitting}
              style={{ background: "#2563eb", color: "#ffffff" }}
            >
              {isSubmitting ? "Memproses..." : "Login"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
