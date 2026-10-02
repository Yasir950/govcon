"use client";

import { useFormStatus } from "react-dom";

export function ConfirmButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="auth-submit" type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Confirming…" : label}
    </button>
  );
}
