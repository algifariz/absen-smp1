"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AuthBootstrap() {
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    supabase.auth.getSession().then(({ error }) => {
      const message = error?.message ?? "";
      if (message.includes("Invalid Refresh Token") || message.includes("Refresh Token Not Found")) {
        supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      }
    });
  }, []);

  return null;
}
