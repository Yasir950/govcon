"use client";

import { useActionState } from "react";
import { submitContactMessageAction, type ContactActionResult } from "./actions";

const initialState: ContactActionResult = {};

export function ContactForm() {
  const [state, formAction, pending] = useActionState(submitContactMessageAction, initialState);

  if (state.success) {
    return (
      <p>
        Thanks — we received your message and will get back to you soon.
      </p>
    );
  }

  return (
    <div className="opps-app">
      <form action={formAction} className="form-grid" style={{ maxWidth: 480, marginTop: 16 }}>
        <label className="label">
          Name
          <input className="field" name="name" required />
        </label>
        <label className="label">
          Email
          <input className="field" type="email" name="email" required />
        </label>
        <label className="label" style={{ gridColumn: "1 / -1" }}>
          Message
          <textarea className="textarea" name="message" required />
        </label>
        {state.error && <p style={{ color: "#c0392b", gridColumn: "1 / -1" }}>{state.error}</p>}
        <div style={{ gridColumn: "1 / -1" }}>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send message"}
          </button>
        </div>
      </form>
    </div>
  );
}
