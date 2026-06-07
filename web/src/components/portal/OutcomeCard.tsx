"use client";

/**
 * Outcome card for the insurer portal — the screenshot-ready call result.
 *
 * Renders the latest `outcome.created` event: claim status, claim number,
 * missing documents, deadline, what sensitive info was shared, approvals,
 * language switch, preference learned, and follow-up. This is the structured
 * record the business receives at the end of an assisted call.
 */

import { type VoiceBridgeEvent } from "@voicebridge/contracts";

type Outcome = Extract<VoiceBridgeEvent, { type: "outcome.created" }>["payload"];

function latestOutcome(events: readonly VoiceBridgeEvent[]): Outcome | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e && e.type === "outcome.created") return e.payload;
  }
  return null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-widest text-vb-muted">{label}</span>
      <span className="text-sm text-vb-text">{children}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const pending = status.toLowerCase().includes("pending");
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
        pending ? "bg-vb-warn/15 text-vb-warn" : "bg-vb-accent-2/15 text-vb-accent-2"
      }`}
    >
      {status}
    </span>
  );
}

export function OutcomeCard({ events }: { events: readonly VoiceBridgeEvent[] }) {
  const outcome = latestOutcome(events);

  if (!outcome) {
    return (
      <section className="rounded-xl border border-vb-border bg-vb-surface p-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-vb-surface-2 text-vb-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <h2 className="text-sm font-medium text-vb-text">Outcome</h2>
        </div>
        <p className="mt-3 text-sm text-vb-muted">
          The outcome card appears here when the assisted call completes.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-vb-accent/40 bg-vb-surface p-5 shadow-[0_0_0_1px_rgba(79,140,255,0.1),0_0_32px_rgba(79,140,255,0.06)] animate-fade-up">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-vb-accent/15 text-vb-accent">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-vb-text">Call outcome</h2>
        </div>
        <StatusBadge status={outcome.claim_status} />
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg border border-vb-border/60 bg-vb-surface-2/40 p-4">
        {outcome.claim_number && (
          <Field label="Claim number">
            <code className="font-mono text-vb-accent">{outcome.claim_number}</code>
          </Field>
        )}
        {outcome.deadline && <Field label="Deadline">{outcome.deadline}</Field>}

        <Field label="Missing documents">
          {outcome.missing_documents.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {outcome.missing_documents.map((d) => (
                <span
                  key={d}
                  className="rounded bg-vb-warn/10 px-1.5 py-0.5 text-xs text-vb-warn"
                >
                  {d}
                </span>
              ))}
            </span>
          ) : (
            <span className="text-vb-muted">none</span>
          )}
        </Field>

        <Field label="Sensitive info shared">
          {outcome.sensitive_info_shared.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {outcome.sensitive_info_shared.map((f) => (
                <span
                  key={f}
                  className="rounded bg-vb-accent/15 px-1.5 py-0.5 text-xs text-vb-accent"
                >
                  {f}
                </span>
              ))}
            </span>
          ) : (
            <span className="text-vb-muted">none</span>
          )}
        </Field>

        {outcome.approvals.length > 0 && (
          <Field label="Approvals">
            <ul className="space-y-0.5">
              {outcome.approvals.map((a, i) => (
                <li key={i} className="flex items-center gap-1.5 text-sm text-vb-text">
                  <span className="text-vb-accent-2">·</span> {a}
                </li>
              ))}
            </ul>
          </Field>
        )}

        {outcome.language_switch && (
          <Field label="Language switch">
            <span className="font-medium">{outcome.language_switch.from}</span>
            <span className="mx-1 text-vb-muted">→</span>
            <span className="font-medium text-vb-accent">{outcome.language_switch.to}</span>
          </Field>
        )}

        {outcome.preference_learned && (
          <Field label="Preference learned">{outcome.preference_learned}</Field>
        )}

        {outcome.follow_up && <Field label="Follow-up">{outcome.follow_up}</Field>}
      </div>
    </section>
  );
}
