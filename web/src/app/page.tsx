import Link from "next/link";
import { DEMO } from "@voicebridge/contracts";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-widest text-vb-accent">
          {DEMO.tenantDisplayName}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">VoiceBridge</h1>
        <p className="max-w-prose text-vb-muted">
          The business-deployed conversational access layer for high-stakes
          insurance and financial-service phone workflows. Memory-aware,
          consent-aware, and multilingual.
        </p>
      </header>

      <nav className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/console"
          className="rounded-xl border border-vb-border bg-vb-surface p-6 transition hover:border-vb-accent"
        >
          <h2 className="mb-1 text-lg font-medium">User Console →</h2>
          <p className="text-sm text-vb-muted">
            Member-facing surface. Enter intent, approve disclosures, switch
            language, correct tone — drive the whole call without speaking.
          </p>
        </Link>
        <Link
          href="/portal"
          className="rounded-xl border border-vb-border bg-vb-surface p-6 transition hover:border-vb-accent"
        >
          <h2 className="mb-1 text-lg font-medium">Insurer Portal →</h2>
          <p className="text-sm text-vb-muted">
            Northstar dashboard. Live call state, sponsor runtime trace, consent
            events, audit log, and the outcome card.
          </p>
        </Link>
      </nav>

      <footer className="text-xs text-vb-muted">
        Demo case <code className="text-vb-text">{DEMO.caseId}</code> · user{" "}
        <code className="text-vb-text">{DEMO.userDisplayName}</code>
      </footer>
    </main>
  );
}
