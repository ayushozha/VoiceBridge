"use client";

/**
 * Consent + guardrail audit log for the insurer portal.
 *
 * Filters the stream to the safety-relevant events — consent requested /
 * approved / denied and every guardrail decision — and renders them as an
 * append-only, timestamped record. This is the "auditable by design" proof:
 * the invariant is that no sensitive field is spoken before consent.approved.
 */

import type { JSX } from "react";
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

const ENTRY_ICON: Record<AuditEntry["type"], JSX.Element> = {
  "consent.requested": (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
  ),
  "consent.approved": (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  "consent.denied": (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  "guardrail.checked": (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
};

function EntryRow({ entry }: { entry: AuditEntry }) {
  let badge: { text: string; cls: string; iconCls: string };
  let title: string;
  let detail: string;

  switch (entry.type) {
    case "consent.requested":
      badge = { text: "requested", cls: "bg-vb-warn/15 text-vb-warn border border-vb-warn/30", iconCls: "text-vb-warn" };
      title = `Consent · ${entry.payload.field}`;
      detail = `${entry.payload.rule} — "${entry.payload.proposed_disclosure}"`;
      break;
    case "consent.approved":
      badge = { text: "approved", cls: "bg-vb-accent-2/15 text-vb-accent-2 border border-vb-accent-2/30", iconCls: "text-vb-accent-2" };
      title = `Consent · ${entry.payload.field}`;
      detail = entry.payload.shared_value
        ? `shared: ${entry.payload.shared_value}`
        : "approved";
      break;
    case "consent.denied":
      badge = { text: "denied", cls: "bg-vb-danger/15 text-vb-danger border border-vb-danger/30", iconCls: "text-vb-danger" };
      title = `Consent · ${entry.payload.field}`;
      detail = entry.payload.alternate ? `alternate: ${entry.payload.alternate}` : "not disclosed";
      break;
    case "guardrail.checked":
      badge =
        entry.payload.decision === "block"
          ? { text: "blocked", cls: "bg-vb-danger/15 text-vb-danger border border-vb-danger/30", iconCls: "text-vb-danger" }
          : { text: "allowed", cls: "bg-vb-accent-2/15 text-vb-accent-2 border border-vb-accent-2/30", iconCls: "text-vb-accent-2" };
      title = `Guardrail · ${entry.payload.action}`;
      detail = `${entry.payload.reason} (${entry.payload.enforced_by})`;
      break;
  }

  return (
    <li className="flex items-start gap-3 rounded-lg border border-vb-border/40 bg-vb-surface-2/40 px-3 py-2.5">
      <span
        className={`mt-0.5 flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${badge.cls}`}
      >
        <span className={badge.iconCls}>{ENTRY_ICON[entry.type]}</span>
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
        <ul className="flex flex-col gap-2">
          {entries.map((entry, i) => (
            <EntryRow key={`${entry.type}-${entry.timestamp}-${i}`} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  );
}
