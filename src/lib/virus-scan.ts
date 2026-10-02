import "server-only";

// Virus scan for admin-uploaded resource files. Talks to a ClamAV REST
// service (e.g. the ajilach/clamav-rest container — POST /v2/scan with a
// multipart "file" field; 200 = clean, 406 = infected). Configure with:
//
//   VIRUS_SCAN_URL=https://scanner.example.com/v2/scan
//   VIRUS_SCAN_TOKEN=…   (optional, sent as a Bearer token)
//
// With no VIRUS_SCAN_URL the file is marked "unscanned": admins see a
// warning on the resource, and members can still download it (uploads are
// admin-only). A scanner that errors or times out marks it "failed", which
// is never served.

export type ScanStatus = "clean" | "unscanned" | "infected" | "failed";

export async function scanFile(bytes: Uint8Array, fileName: string): Promise<{ status: ScanStatus; detail?: string }> {
  const url = process.env.VIRUS_SCAN_URL;
  if (!url) return { status: "unscanned" };

  const form = new FormData();
  form.set("file", new Blob([bytes as BlobPart]), fileName);
  const headers: Record<string, string> = {};
  if (process.env.VIRUS_SCAN_TOKEN) headers.Authorization = `Bearer ${process.env.VIRUS_SCAN_TOKEN}`;

  try {
    const res = await fetch(url, { method: "POST", body: form, headers, signal: AbortSignal.timeout(60_000) });
    const text = await res.text().catch(() => "");
    if (res.status === 406 || /"Status"\s*:\s*"FOUND"/i.test(text)) return { status: "infected", detail: text.slice(0, 300) };
    if (res.ok) return { status: "clean" };
    return { status: "failed", detail: `Scanner returned ${res.status}` };
  } catch (err) {
    return { status: "failed", detail: err instanceof Error ? err.message : "Scanner unreachable" };
  }
}

// The bucket only checks the declared content type; this checks the bytes
// actually match the extension, so a renamed .exe can't pass as a .pdf.
export function contentMatchesExtension(bytes: Uint8Array, ext: string): boolean {
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  switch (ext) {
    case "pdf":
      return startsWith([0x25, 0x50, 0x44, 0x46]); // %PDF
    case "docx":
    case "xlsx":
    case "pptx":
    case "zip":
      return startsWith([0x50, 0x4b, 0x03, 0x04]) || startsWith([0x50, 0x4b, 0x05, 0x06]); // PK zip
    case "csv":
      // Plain text: no NUL bytes in the first 8 KB.
      return !bytes.subarray(0, 8192).includes(0);
    default:
      return false;
  }
}
