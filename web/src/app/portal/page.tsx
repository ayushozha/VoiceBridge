/**
 * Insurer Portal — Northstar Insurance dashboard (Agent 7).
 *
 * Business-facing observer surface. Server component:
 *   - reads honest live/stub sponsor status from env (`integrationModes()`),
 *   - mints a short-lived OBSERVER LiveKit token (no publish) so the dashboard
 *     can watch the live VoiceBridge event stream,
 *   - falls back to standalone mock-only mode if LiveKit env is unconfigured.
 *
 * All live data flows through the contract event stream; the client dashboard
 * (PortalRoom → PortalDashboard) renders the runtime trace, sponsor badges,
 * transcript, consent/guardrail audit, and the outcome card.
 */

import Link from "next/link";
import { AccessToken } from "livekit-server-sdk";
import { DEMO } from "@voicebridge/contracts";
import { serverEnv, integrationModes } from "@/lib/env";
import { PortalRoom, type PortalToken } from "@/components/portal/PortalRoom";

export const dynamic = "force-dynamic";

/** Mint an observer token directly (server-only). Null if LiveKit isn't configured. */
async function mintObserverToken(): Promise<PortalToken | null> {
  try {
    const room = serverEnv.roomName();
    const at = new AccessToken(serverEnv.livekitApiKey(), serverEnv.livekitApiSecret(), {
      identity: "portal_observer",
      name: "portal_observer",
      ttl: "1h",
      metadata: JSON.stringify({ role: "observer", tenant_id: DEMO.tenantId, case_id: DEMO.caseId }),
    });
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: false,
      canPublishData: false,
      canSubscribe: true,
    });
    return { token: await at.toJwt(), serverUrl: serverEnv.livekitUrl() };
  } catch {
    // Missing/placeholder LiveKit env → run the portal standalone on the mock.
    return null;
  }
}

export default async function PortalPage() {
  const modes = integrationModes();
  const connection = await mintObserverToken();

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

      <PortalRoom modes={modes} connection={connection} />
    </main>
  );
}
