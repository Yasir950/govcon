import { Resend } from "resend";

// Server-only. Never import this from a Client Component.
export const resend = new Resend(process.env.RESEND_API_KEY!);
