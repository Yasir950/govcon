"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ModalShell } from "@/components/ModalShell";
import { SubmitCompanyForm } from "@/components/companies/SubmitCompanyForm";

// "+ Add Company" button + its submit modal, shared by the Companies
// directory header and /companies/mine. `refreshOnSuccess` re-renders the
// server page so a just-submitted company shows up in the list.
export function AddCompanyButton({ refreshOnSuccess = false }: { refreshOnSuccess?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        + Add Company
      </button>
      {open && (
        <ModalShell title="Add a Company" onClose={() => setOpen(false)}>
          <SubmitCompanyForm
            onSuccess={() => {
              setOpen(false);
              if (refreshOnSuccess) router.refresh();
            }}
          />
        </ModalShell>
      )}
    </>
  );
}
