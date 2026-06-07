/**
 * Insurer Portal — Northstar Insurance dashboard (Agent 7).
 *
 * Business-facing observer surface. Server component: reads honest live/stub
 * sponsor status from env (`integrationModes()`, server-only) and hands it to
 * the client shell. The shell wraps the dashboard in Agent 1's
 * <CallProvider role="observer">, which fetches an observer token via /api/token
 * and provides the LiveKit RoomContext the runtime trace reads. If the room is
 * unreachable, the dashboard's standalone "Replay demo" path stays demoable.
 */

import Link from "next/link";
import { DEMO } from "@voicebridge/contracts";
import { integrationModes } from "@/lib/env";
import { PortalClient } from "@/components/portal/PortalClient";

export const dynamic = "force-dynamic";

export default function PortalPage() {
  const modes = integrationModes();

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6 flex flex-col gap-3 border-b border-vb-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-vb-accent">
            {DEMO.tenantDisplayName} · Staff portal
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">VoiceBridge Operations</h1>
          <p className="max-w-prose text-sm text-vb-muted">
            Business-deployed conversational access layer. Watch an assisted claim
            call in real time — every sponsor in the call, memory, guardrail,
            document, voice, and audit path is visible below.
          </p>
        </div>
        <Link
          href="/console"
          className="shrink-0 rounded-lg border border-vb-border px-3 py-1.5 text-sm text-vb-muted transition hover:border-vb-accent hover:text-vb-text"
        >
          Member console →
        </Link>
      </header>

      <PortalClient modes={modes} />
    </main>
  );
}
