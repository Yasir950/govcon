// Password complexity rule. The full check (length + letter + number +
// special character) applies wherever a NEW password is being set —
// signup and reset-password. Login only reuses PASSWORD_HINT for a
// too-short entry (impossible for any real account, since both of those
// flows already enforce 8+ characters, so it's always a mistyped
// password) — it does not re-run the full regex, since Supabase itself is
// the real authority on whether a correctly-sized password matches the
// account.
export const PASSWORD_HINT = "Use 8+ characters with a letter, number, and special character (@, #, $, %).";

export function validateNewPassword(password: string): string | null {
  if (password.length < 8) return PASSWORD_HINT;
  if (!/[A-Za-z]/.test(password)) return "Password must include at least one letter.";
  if (!/[0-9]/.test(password)) return "Password must include at least one number.";
  if (!/[@#$%]/.test(password)) return "Password must include at least one special character (@, #, $, %).";
  return null;
}
