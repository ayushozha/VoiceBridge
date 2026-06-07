"use client";

/**
 * Consent + guardrail audit log for the insurer portal.
 *
 * Filters the stream to the safety-relevant events — consent requested /
 * approved / denied and every guardrail decision — and renders them as an
 * append-only, timestamped record. This is the "auditable by design" proof:
 * the invariant is that no sensitive field is spoken before consent.approved.
 */

import { type VoiceBridgeEvent } from "@voicebridge/contracts";

type AuditEntry =
  | Extract<VoiceBridgeEvent, { type: "consent.requested" }>
  | Extract<VoiceBridgeEvent, { type: "consent.approved" }>
  | Extract<VoiceBridgeEvent, { type: "consent.denied" }>
  | Extract<VoiceBridgeEvent, { type: "guardrail.checked" }>;

function isAuditEntry(e: VoiceBridgeEvent): e is AuditEntry {
  return (
    e.type === "consent.requested" ||
    e.type === "consent.approved" ||
    e.type === "consent.denied" ||
    e.type === "guardrail.checked"
  );
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour12: false, minute: "2-digit", second: "2-digit" });
}

function EntryRow({ entry }: { entry: AuditEntry }) {
  let badge: { text: string; cls: string };
  let title: string;
  let detail: string;

  switch (entry.type) {
    case "consent.requested":
      badge = { text: "requested", cls: "bg-vb-warn/15 text-vb-warn" };
      title = `Consent · ${entry.payload.field}`;
      detail = `${entry.payload.rule} — "${entry.payload.proposed_disclosure}"`;
      break;
    case "consent.approved":
      badge = { text: "approved", cls: "bg-vb-accent-2/15 text-vb-accent-2" };
      title = `Consent · ${entry.payload.field}`;
      detail = entry.payload.shared_value
        ? `shared: ${entry.payload.shared_value}`
        : "approved";
      break;
    case "consent.denied":
      badge = { text: "denied", cls: "bg-vb-danger/15 text-vb-danger" };
      title = `Consent · ${entry.payload.field}`;
      detail = entry.payload.alternate ? `alternate: ${entry.payload.alternate}` : "not disclosed";
      break;
    case "guardrail.checked":
      badge =
        entry.payload.decision === "block"
          ? { text: "blocked", cls: "bg-vb-danger/15 text-vb-danger" }
          : { text: "allowed", cls: "bg-vb-accent-2/15 text-vb-accent-2" };
      title = `Guardrail · ${entry.payload.action}`;
      detail = `${entry.payload.reason} (${entry.payload.enforced_by})`;
      break;
  }

  return (
    <li className="flex items-start gap-3 border-b border-vb-border/60 py-2 last:border-0">
      <span
        className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${badge.cls}`}
      >
        {badge.text}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-vb-text">{title}</p>
        <p className="truncate text-[11px] text-vb-muted">{detail}</p>
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-vb-muted">
        {timeLabel(entry.timestamp)}
      </span>
    </li>
  );
}

export function ConsentAuditLog({ events }: { events: readonly VoiceBridgeEvent[] }) {
  const entries = events.filter(isAuditEntry);

  return (
    <section className="rounded-xl border border-vb-border bg-vb-surface p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium text-vb-text">Consent &amp; guardrail audit</h2>
        <span className="text-[10px] uppercase tracking-widest text-vb-muted">
          {entries.length} entries
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-vb-muted">
          No sensitive disclosures or guardrail checks yet. Every one will be recorded here.
        </p>
      ) : (
        <ul>
          {entries.map((entry, i) => (
            <EntryRow key={`${entry.type}-${entry.timestamp}-${i}`} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  );
}
