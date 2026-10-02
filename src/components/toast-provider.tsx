"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext<((message: string) => void) | null>(null);

// Mounted once in the root layout so every page (and shared chrome like
// SiteHeader/SiteFooter) can trigger the same toast without prop-drilling
// showToast through 8 separate route trees. Owns the single `.toast` div —
// the CSS (.toast/.toast.show, landing.css) stays wired up in one place.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string) => {
    setMessage(text);
    setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), 2400);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className={`toast${visible ? " show" : ""}`}>{message}</div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const showToast = useContext(ToastContext);
  if (!showToast) throw new Error("useToast must be used within a ToastProvider");
  return showToast;
}
