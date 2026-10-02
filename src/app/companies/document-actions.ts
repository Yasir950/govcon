"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type DocumentActionResult = { error?: string };

// company_documents has a full RLS "for all" grant to company_admins
// members (see 20260921002900_company_documents.sql) — no explicit
// membership check needed here, matching certifications-actions.ts's
// RLS-only pattern; a non-admin's insert is simply rejected by Postgres.
export async function saveCompanyDocumentAction(
  companyId: string,
  companySlug: string,
  name: string,
  storagePath: string,
  isPublic: boolean,
): Promise<DocumentActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };
  if (!name.trim()) return { error: "Give the document a name." };

  const { error } = await supabase
    .from("company_documents")
    .insert({ company_id: companyId, name: name.trim(), storage_path: storagePath, is_public: isPublic, uploaded_by: user.id });
  if (error) return { error: "Couldn't save that document. Please try again." };

  revalidatePath(`/companies/${companySlug}`);
  return {};
}

export async function deleteCompanyDocumentAction(documentId: string, storagePath: string, companySlug: string): Promise<DocumentActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("company_documents").delete().eq("id", documentId);
  if (error) return { error: "Couldn't delete that document. Please try again." };
  await supabase.storage.from("company-documents").remove([storagePath]);

  revalidatePath(`/companies/${companySlug}`);
  return {};
}

export async function setCompanyDocumentVisibilityAction(documentId: string, isPublic: boolean, companySlug: string): Promise<DocumentActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("company_documents").update({ is_public: isPublic }).eq("id", documentId);
  if (error) return { error: "Couldn't update that document. Please try again." };
  revalidatePath(`/companies/${companySlug}`);
  return {};
}

export type DownloadUrlResult = { url?: string; error?: string };

export async function getCompanyDocumentDownloadUrlAction(storagePath: string): Promise<DownloadUrlResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("company-documents").createSignedUrl(storagePath, 60);
  if (error || !data) return { error: "Couldn't generate a download link." };
  return { url: data.signedUrl };
}
