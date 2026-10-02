"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/toast-provider";
import { ExpertQueue } from "@/components/points/ExpertQueue";
import { createClient } from "@/lib/supabase/client";
import type { ExpertPoolMember } from "@/app/(app)/expert-queue/actions";
import type { ExpertRequest } from "@/lib/points-types";
import { addPerkCodesAction, savePerkAction, setExpertAction, setStoreFileAction, type PerkInput } from "./actions";

// store_admin_overview(): one row per reward with a fulfilment kind.
export interface StoreAdminReward {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  fulfilment: "download" | "expert_review" | "expert_call" | "partner_code" | "event_ticket";
  price: number;
  limit_count: number | null;
  limit_period: string | null;
  active: boolean;
  stock_count: number | null;
  stock_period: "quarter" | "year";
  stock_used: number | null;
  partner_company_id: string | null;
  partner_url: string | null;
  partner_name: string | null;
  file_path: string | null;
  file_name: string | null;
  shared_code: string | null;
  instructions: string | null;
  codes_total: number;
  codes_left: number;
  redeemed: number;
  unavailable: "coming_soon" | "sold_out" | null;
}

type Result = { ok: true; message?: string } | { ok: false; error: string };

function useRun() {
  const showToast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<Result>) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    showToast(res.ok ? (res.message ?? "Done.") : res.error);
    if (res.ok) router.refresh();
    return res.ok;
  };
  return { run, busy };
}

function availability(r: StoreAdminReward) {
  if (!r.active) return "Hidden";
  if (r.unavailable === "coming_soon") return "Coming soon (not buyable)";
  if (r.unavailable === "sold_out") return "Sold out";
  return "On sale";
}

// Store fulfilment: download files, the expert pool and its requests, and
// partner perks. Prices, limits and quarterly/yearly stock caps are edited
// in "Quests, badges & store".
export function AdminStore({
  rewards,
  requests,
  experts,
  partners,
  viewerId,
}: {
  rewards: StoreAdminReward[];
  requests: ExpertRequest[];
  experts: ExpertPoolMember[];
  partners: { id: string; name: string }[];
  viewerId: string;
}) {
  const downloads = rewards.filter((r) => r.fulfilment === "download");
  const perks = rewards.filter((r) => r.fulfilment === "partner_code");
  const others = rewards.filter((r) => r.fulfilment !== "download" && r.fulfilment !== "partner_code");
  const openRequests = requests.filter((q) => q.status === "open").length;

  return (
    <>
      <section className="card panel" style={{ marginBottom: 16 }}>
        <h3 className="section-title">Budget and stock</h3>
        <p className="meta">
          Expert reviews and partner perks cost real money or partner agreements. Set a stock cap per quarter or year in{" "}
          <a href="/admin/points?tab=catalog">Quests, badges &amp; store</a> once the yearly budget is decided (blank = no cap).
        </p>
        <table className="points-table">
          <thead>
            <tr>
              <th>Reward</th>
              <th>Credits</th>
              <th>Status</th>
              <th>Stock</th>
              <th>Redeemed</th>
            </tr>
          </thead>
          <tbody>
            {[...others, ...downloads, ...perks].map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.price.toLocaleString()}</td>
                <td>{availability(r)}</td>
                <td>{r.stock_count === null ? "No cap" : `${r.stock_used ?? 0} of ${r.stock_count} this ${r.stock_period}`}</td>
                <td>{r.redeemed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card panel" style={{ marginBottom: 16 }}>
        <h3 className="section-title">Downloads</h3>
        <p className="meta">A download can&apos;t be bought until its file is attached. Members can only open it after buying it.</p>
        {downloads.map((r) => (
          <DownloadRow key={r.id} reward={r} />
        ))}
      </section>

      <section className="card panel" style={{ marginBottom: 16 }}>
        <h3 className="section-title">Expert pool</h3>
        <p className="meta">
          Expert rewards stay &quot;Coming soon&quot; until someone here is active for them. Experts work from{" "}
          <a href="/expert-queue">/expert-queue</a>.
        </p>
        <ExpertPool experts={experts} />
      </section>

      <section style={{ marginBottom: 16 }}>
        <h3 className="section-title">
          Expert requests{openRequests > 0 && ` · ${openRequests} need an expert`}
        </h3>
        <ExpertQueue requests={requests} experts={experts} isAdmin viewerId={viewerId} />
      </section>

      <section className="card panel" style={{ marginBottom: 16 }}>
        <h3 className="section-title">Partner perks</h3>
        <p className="meta">
          One store item per perk (spec range 200 to 800 Credits). Give it either a pool of one-use codes (it sells out when they run
          out) or one shared code, plus how to use it. Members see the code and instructions only after redeeming.
        </p>
        {perks.map((r) => (
          <PerkEditor key={r.id} perk={r} partners={partners} />
        ))}
        <PerkEditor perk={null} partners={partners} />
      </section>
    </>
  );
}

function DownloadRow({ reward }: { reward: StoreAdminReward }) {
  const { run, busy } = useRun();
  const [file, setFile] = useState<File | null>(null);

  const upload = () =>
    run(async () => {
      if (!file) return { ok: false, error: "Choose a file." };
      const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, "-");
      const path = `${reward.code}/${Date.now()}-${safe}`;
      const { error } = await createClient().storage.from("store-files").upload(path, file, { contentType: file.type || undefined });
      if (error) return { ok: false, error: `Upload failed: ${error.message}` };
      return setStoreFileAction(reward.id, path, file.name);
    });

  return (
    <div className="store-request-action" style={{ borderTop: "1px solid var(--border, #e5e7eb)", paddingTop: 10 }}>
      <div style={{ flex: "1 1 220px" }}>
        <strong>{reward.name}</strong>
        <div className="meta">
          {reward.file_name ? `File: ${reward.file_name}` : "No file yet"} · {reward.redeemed} bought · {availability(reward)}
        </div>
      </div>
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button className="btn btn-secondary" disabled={busy || !file} onClick={upload}>
        {reward.file_path ? "Replace file" : "Attach file"}
      </button>
    </div>
  );
}

function ExpertPool({ experts }: { experts: ExpertPoolMember[] }) {
  const { run, busy } = useRun();
  const [email, setEmail] = useState("");
  const [reviews, setReviews] = useState(true);
  const [calls, setCalls] = useState(true);
  const [note, setNote] = useState("");

  return (
    <>
      {experts.length > 0 && (
        <table className="points-table" style={{ marginBottom: 12 }}>
          <thead>
            <tr>
              <th>Expert</th>
              <th>Reviews</th>
              <th>Calls</th>
              <th>Active</th>
              <th>Open</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {experts.map((e) => {
              const save = (patch: Partial<Pick<ExpertPoolMember, "reviews" | "calls" | "active">>) =>
                run(() =>
                  setExpertAction(null, e.id, patch.reviews ?? e.reviews, patch.calls ?? e.calls, patch.active ?? e.active, e.note ?? ""),
                );
              return (
                <tr key={e.id}>
                  <td>
                    <a href={`/network/${e.id}`}>{e.name}</a>
                  </td>
                  <td>
                    <input type="checkbox" checked={e.reviews} disabled={busy} onChange={(ev) => save({ reviews: ev.target.checked })} />
                  </td>
                  <td>
                    <input type="checkbox" checked={e.calls} disabled={busy} onChange={(ev) => save({ calls: ev.target.checked })} />
                  </td>
                  <td>
                    <input type="checkbox" checked={e.active} disabled={busy} onChange={(ev) => save({ active: ev.target.checked })} />
                  </td>
                  <td>{e.open}</td>
                  <td>{e.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="store-request-action">
        <input type="email" placeholder="Member email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>
          <input type="checkbox" checked={reviews} onChange={(e) => setReviews(e.target.checked)} /> Reviews
        </label>
        <label>
          <input type="checkbox" checked={calls} onChange={(e) => setCalls(e.target.checked)} /> Calls
        </label>
        <input placeholder="Note (e.g. specialty)" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1 }} />
        <button
          className="btn btn-secondary"
          disabled={busy || !email.trim() || (!reviews && !calls)}
          onClick={async () => {
            if (await run(() => setExpertAction(email, null, reviews, calls, true, note))) {
              setEmail("");
              setNote("");
            }
          }}
        >
          Add expert
        </button>
      </div>
    </>
  );
}

function PerkEditor({ perk, partners }: { perk: StoreAdminReward | null; partners: { id: string; name: string }[] }) {
  const { run, busy } = useRun();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PerkInput>(() => ({
    id: perk?.id ?? null,
    name: perk?.name ?? "",
    description: perk?.description ?? "",
    price: perk?.price ?? 200,
    limitCount: perk?.limit_count ?? 1,
    limitPeriod: perk?.limit_period ?? "year",
    partnerCompanyId: perk?.partner_company_id ?? null,
    partnerUrl: perk?.partner_url ?? "",
    sharedCode: perk?.shared_code ?? "",
    instructions: perk?.instructions ?? "",
    active: perk?.active ?? true,
  }));
  const [codes, setCodes] = useState("");
  const set = <K extends keyof PerkInput>(k: K, v: PerkInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  if (!open) {
    return (
      <div className="store-request-action" style={{ borderTop: "1px solid var(--border, #e5e7eb)", paddingTop: 10 }}>
        {perk ? (
          <>
            <div style={{ flex: "1 1 220px" }}>
              <strong>{perk.name}</strong>
              <div className="meta">
                {perk.price.toLocaleString()} Credits
                {perk.partner_name && ` · ${perk.partner_name}`}
                {perk.codes_total > 0 ? ` · ${perk.codes_left} of ${perk.codes_total} codes left` : perk.shared_code ? " · shared code" : ""}
                {` · ${perk.redeemed} redeemed · ${availability(perk)}`}
              </div>
            </div>
            <button className="btn btn-secondary" onClick={() => setOpen(true)}>
              Edit
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            Add a partner perk
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 8, borderTop: "1px solid var(--border, #e5e7eb)", paddingTop: 10 }}>
      <div className="store-perk-form">
        <label>
          <span className="meta">Name</span>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="20% off Serrenta" />
        </label>
        <label>
          <span className="meta">Credits</span>
          <input type="number" min={0} value={form.price} onChange={(e) => set("price", Number(e.target.value))} />
        </label>
        <label>
          <span className="meta">Limit per member</span>
          <span style={{ display: "flex", gap: 6 }}>
            <input
              type="number"
              min={0}
              value={form.limitCount ?? ""}
              onChange={(e) => set("limitCount", e.target.value === "" ? null : Number(e.target.value))}
              style={{ width: 70 }}
            />
            <select value={form.limitPeriod ?? "year"} onChange={(e) => set("limitPeriod", e.target.value)}>
              <option value="ever">ever</option>
              <option value="year">a year</option>
              <option value="quarter">a quarter</option>
              <option value="month">a month</option>
            </select>
          </span>
        </label>
        <label>
          <span className="meta">Partner company</span>
          <select value={form.partnerCompanyId ?? ""} onChange={(e) => set("partnerCompanyId", e.target.value || null)}>
            <option value="">None</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ gridColumn: "1 / -1" }}>
          <span className="meta">Description (shown in the store)</span>
          <input value={form.description} onChange={(e) => set("description", e.target.value)} />
        </label>
        <label>
          <span className="meta">Partner link (shown after redeeming)</span>
          <input type="url" value={form.partnerUrl} onChange={(e) => set("partnerUrl", e.target.value)} placeholder="https://" />
        </label>
        <label>
          <span className="meta">Shared code (if not using one-use codes)</span>
          <input value={form.sharedCode} onChange={(e) => set("sharedCode", e.target.value)} />
        </label>
        <label style={{ gridColumn: "1 / -1" }}>
          <span className="meta">How to use it (shown after redeeming)</span>
          <input value={form.instructions} onChange={(e) => set("instructions", e.target.value)} placeholder="Enter the code at checkout." />
        </label>
        <label>
          <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} /> Show in the store
        </label>
      </div>
      <div className="store-request-action" style={{ marginTop: 0 }}>
        <button
          className="btn btn-primary"
          disabled={busy || !form.name.trim()}
          onClick={async () => {
            if (await run(() => savePerkAction(form))) setOpen(false);
          }}
        >
          {perk ? "Save perk" : "Add perk"}
        </button>
        <button className="btn btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {perk && (
        <div className="stack" style={{ gap: 6 }}>
          <label>
            <span className="meta">Add one-use codes (one per line)</span>
            <textarea rows={4} value={codes} onChange={(e) => setCodes(e.target.value)} style={{ width: "100%" }} />
          </label>
          <div>
            <button
              className="btn btn-secondary"
              disabled={busy || !codes.trim()}
              onClick={async () => {
                if (await run(() => addPerkCodesAction(perk.id, codes))) setCodes("");
              }}
            >
              Add codes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
