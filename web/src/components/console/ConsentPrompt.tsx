"use client";

/**
 * Consent gate — the product invariant made visible.
 *
 * When a `consent.requested` event arrives, the member sees WHICH sensitive
 * field is being asked for and the options ([Share] [Type different answer]
 * [Ask why]) — but NEVER the proposed value itself. The contract's
 * `proposed_disclosure` carries the literal value (e.g. "the claim number is
 * H-48291"); we deliberately do not render it until the member approves.
 *
 * Invariant: the sensitive value is not shown on screen before an explicit
 * approval. Decline / alternate answer paths never reveal it at all.
 */

import { useState } from "react";
import type { ConsentRequestedPayload, SensitiveField } from "@voicebridge/contracts";
import { ConsoleButton, Panel, Pill } from "./ui";

/** Human-readable label for a sensitive field. */
const FIELD_LABEL: Record<SensitiveField, string> = {
  claim_number: "claim number",
  policy_id: "policy ID",
  address: "address",
  date_of_loss: "date of loss",
  phone_number: "phone number",
  date_of_birth: "date of birth",
  ssn: "Social Security number",
  account_number: "account number",
  payment_information: "payment information",
  caregiver_contact: "caregiver contact",
};

export type ConsentDecision =
  | { kind: "approve" }
  | { kind: "deny" }
  | { kind: "alternate"; text: string }
  | { kind: "ask_why" };

export function ConsentPrompt({
  request,
  onDecide,
}: {
  request: ConsentRequestedPayload;
  onDecide: (decision: ConsentDecision) => void;
}) {
  const [mode, setMode] = useState<"choose" | "alternate" | "why">("choose");
  const [alternate, setAlternate] = useState("");

  const field = FIELD_LABEL[request.field] ?? request.field;

  return (
    <Panel
      title="Consent needed"
      subtitle={request.rule === "ask_every_time" ? "ask every time" : request.rule}
      accent="warn"
      animate
    >
      <div className="space-y-4">
        {/* Identity of what's being requested */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="animate-pulse-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-vb-warn/20 text-vb-warn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
          </span>
          <span className="text-base font-medium text-vb-text">
            The insurer is asking for your{" "}
            <strong className="text-vb-warn">{field}</strong>.
          </span>
        </div>

        <p className="rounded-lg border border-vb-warn/20 bg-vb-warn/5 px-3.5 py-2.5 text-sm text-vb-muted">
          VoiceBridge will only say your {field} if you approve — it stays
          hidden until then.
        </p>

        {mode === "choose" ? (
          <div className="flex flex-wrap gap-2">
            <ConsoleButton tone="approve" onClick={() => onDecide({ kind: "approve" })}>
              Share
            </ConsoleButton>
            <ConsoleButton tone="neutral" onClick={() => setMode("alternate")}>
              Type different answer
            </ConsoleButton>
            <ConsoleButton tone="neutral" onClick={() => setMode("why")}>
              Ask why
            </ConsoleButton>
            <ConsoleButton tone="danger" onClick={() => onDecide({ kind: "deny" })}>
              Don&apos;t share
            </ConsoleButton>
          </div>
        ) : null}

        {mode === "alternate" ? (
          <div className="flex flex-col gap-2 animate-fade-in">
            <input
              autoFocus
              value={alternate}
              onChange={(e) => setAlternate(e.target.value)}
              placeholder={`Type what to say instead of your ${field}…`}
              className="w-full rounded-lg border border-vb-border bg-vb-bg px-3.5 py-2.5 text-sm text-vb-text placeholder:text-vb-muted transition-colors focus:border-vb-accent focus:outline-none focus:ring-1 focus:ring-vb-accent/30"
            />
            <div className="flex gap-2">
              <ConsoleButton
                tone="accent"
                disabled={!alternate.trim()}
                onClick={() => onDecide({ kind: "alternate", text: alternate.trim() })}
              >
                Use this answer
              </ConsoleButton>
              <ConsoleButton tone="neutral" onClick={() => setMode("choose")}>
                Back
              </ConsoleButton>
            </div>
          </div>
        ) : null}

        {mode === "why" ? (
          <div className="flex flex-col gap-2 animate-fade-in">
            <p className="rounded-lg border border-vb-border bg-vb-surface-2 px-3.5 py-2.5 text-sm leading-relaxed text-vb-muted">
              The insurer needs to match your {field} to your file before they
              can discuss the claim. VoiceBridge will only say it if you approve.
            </p>
            <div className="flex gap-2">
              <ConsoleButton tone="approve" onClick={() => onDecide({ kind: "approve" })}>
                Share
              </ConsoleButton>
              <ConsoleButton tone="neutral" onClick={() => setMode("choose")}>
                Back
              </ConsoleButton>
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
