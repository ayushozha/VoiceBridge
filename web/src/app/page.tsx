import Link from "next/link";
import { DEMO } from "@voicebridge/contracts";

export default function Home() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-12 px-6 py-20">
      {/* Dot-grid background texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "radial-gradient(circle, #4f8cff 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      <header className="relative space-y-4">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-vb-accent/25 bg-vb-accent/10 px-3 py-1">
          <span className="inline-block h-1.5 w-1.5 animate-live rounded-full bg-vb-accent" />
          <span className="text-xs font-semibold uppercase tracking-widest text-vb-accent">
            {DEMO.tenantDisplayName}
          </span>
        </div>
        <h1 className="text-5xl font-bold tracking-tight">
          <span className="text-gradient">VoiceBridge</span>
        </h1>
        <p className="max-w-[42ch] text-lg leading-relaxed text-vb-muted">
          Business-deployed conversational access layer for insurance and
          financial-service phone workflows. Memory-aware, consent-gated, multilingual.
        </p>
      </header>

      <nav className="relative grid gap-4 sm:grid-cols-2">
        <Link
          href="/console"
          className="group rounded-2xl border border-vb-border bg-vb-surface p-6 transition-all duration-200 hover:border-vb-accent hover:glow-accent"
        >
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-vb-accent/15 text-vb-accent transition-colors group-hover:bg-vb-accent/25">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </div>
          <h2 className="mb-1.5 text-base font-semibold">
            User Console
            <span className="ml-1 text-vb-muted transition-colors group-hover:text-vb-accent">
              →
            </span>
          </h2>
          <p className="text-sm leading-relaxed text-vb-muted">
            Member-facing surface. Enter intent, approve disclosures, switch
            language, correct tone — drive the whole call without speaking.
          </p>
        </Link>

        <Link
          href="/portal"
          className="group rounded-2xl border border-vb-border bg-vb-surface p-6 transition-all duration-200 hover:border-vb-accent-2 hover:glow-approve"
        >
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-vb-accent-2/15 text-vb-accent-2 transition-colors group-hover:bg-vb-accent-2/25">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
            </svg>
          </div>
          <h2 className="mb-1.5 text-base font-semibold">
            Insurer Portal
            <span className="ml-1 text-vb-muted transition-colors group-hover:text-vb-accent-2">
              →
            </span>
          </h2>
          <p className="text-sm leading-relaxed text-vb-muted">
            Northstar dashboard. Live call state, sponsor runtime trace, consent
            events, audit log, and the outcome card.
          </p>
        </Link>
      </nav>

      <footer className="relative text-xs text-vb-muted">
        Demo case{" "}
        <code className="rounded bg-vb-surface-2 px-1.5 py-0.5 text-vb-text">
          {DEMO.caseId}
        </code>{" "}
        · user{" "}
        <code className="rounded bg-vb-surface-2 px-1.5 py-0.5 text-vb-text">
          {DEMO.userDisplayName}
        </code>
      </footer>
    </main>
  );
}
