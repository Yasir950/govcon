// Formats a US-style phone number as the member types — "5551234567" ->
// "(555) 123-4567". Left untouched once it starts with "+", since that's an
// international number and guessing a different format for it would only
// get in the way rather than help.
export function formatPhoneInput(value: string): string {
  if (value.trim().startsWith("+")) return value;
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
