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
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="warn">sensitive</Pill>
          <span className="text-base text-vb-text">
            The insurer is asking for your <strong className="text-vb-warn">{field}</strong>.
          </span>
        </div>
        <p className="text-sm text-vb-muted">
          Can I share it? Your {field} stays hidden until you approve.
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
          <div className="flex flex-col gap-2">
            <input
              autoFocus
              value={alternate}
              onChange={(e) => setAlternate(e.target.value)}
              placeholder={`Type what to say instead of your ${field}…`}
              className="w-full rounded-lg border border-vb-border bg-vb-bg px-3 py-2.5 text-sm text-vb-text placeholder:text-vb-muted focus:border-vb-accent focus:outline-none"
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
          <div className="flex flex-col gap-2">
            <p className="rounded-lg border border-vb-border bg-vb-surface-2 px-3 py-2.5 text-sm text-vb-muted">
              The insurer needs to match your {field} to your file before they can
              discuss the claim. VoiceBridge will only say it if you approve.
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
