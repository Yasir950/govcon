"use client";

import { usePathname, useRouter } from "next/navigation";

// Split out of NetworkPageClient so this static title/description/button
// row renders immediately — it never has to wait on the network fetch
// below it. The "Find People" button and the content's own tabs both read
// the same ?tab= query param (via useSearchParams in NetworkPageClient),
// so this header can switch tabs without sharing any component state with
// the not-yet-mounted content.
export function NetworkHeader() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="network-page-head">
      <div>
        <h1>Network</h1>
        <p>Build relationships with contractors, agencies, and industry professionals.</p>
      </div>
      <button className="btn btn-primary" onClick={() => router.replace(`${pathname}?tab=find`, { scroll: false })}>
        ＋ Find People
      </button>
    </div>
  );
}
