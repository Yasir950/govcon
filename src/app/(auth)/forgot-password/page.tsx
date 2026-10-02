import type { Metadata } from "next";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset your password · GovConUnited" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
