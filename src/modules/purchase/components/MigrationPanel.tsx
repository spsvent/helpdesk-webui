"use client";

import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/lib/graphClient";
import { runPurchaseMigration, MigrationReport } from "../migrationRunner";

// Admin-only: copy existing purchase-request tickets into the PurchaseRequests list.
// Copy-only + idempotent — source tickets are never modified.
export default function MigrationPanel() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const [busy, setBusy] = useState<null | "dry" | "live">(null);
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function run(dryRun: boolean) {
    if (!account) return;
    setBusy(dryRun ? "dry" : "live");
    setError(null);
    try {
      const client = getGraphClient(instance, account);
      setReport(await runPurchaseMigration(client, { dryRun }));
    } catch (e) {
      console.error("[MigrationPanel] failed:", e);
      setError("Migration failed. Check the console and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <details className="mt-4 rounded-lg border border-border bg-bg-subtle p-3" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-sm font-medium text-text-primary">Migrate purchases from tickets (admin)</summary>
      <p className="mt-2 text-xs text-text-secondary">
        Copies purchase-request tickets into this list. Copy-only and idempotent — the original
        tickets are never changed. Run a dry-run first.
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => run(true)} disabled={busy !== null} className="px-3 py-1.5 rounded-lg bg-bg-card border border-border text-text-primary text-xs font-medium disabled:opacity-50">
          {busy === "dry" ? "Scanning…" : "Dry run"}
        </button>
        <button type="button" onClick={() => run(false)} disabled={busy !== null} className="px-3 py-1.5 rounded-lg bg-brand-primary text-white text-xs font-medium disabled:opacity-50">
          {busy === "live" ? "Migrating…" : "Run migration"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {report && (
        <div className="mt-3 text-xs text-text-primary">
          <p className="font-medium">
            {report.dryRun ? "Dry run" : "Migration"}: {report.totalPurchaseTickets} purchase tickets ·{" "}
            {report.alreadyMigrated} already migrated ·{" "}
            {report.dryRun
              ? `${report.items.filter((i) => i.action === "would-create").length} would be created`
              : `${report.created} created`}{" "}
            · {report.errors} error{report.errors === 1 ? "" : "s"}
          </p>
          {report.errors > 0 && (
            <ul className="mt-1 text-red-600">
              {report.items.filter((i) => i.action === "error").map((i) => (
                <li key={i.sourceTicketId}>#{i.sourceTicketNumber ?? i.sourceTicketId}: {i.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </details>
  );
}
