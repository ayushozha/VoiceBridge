"use client";

/**
 * End-of-call outcome card, rendered from the `outcome.created` event. Shows
 * the member what was shared, what was approved, and what was learned — the
 * same summary the insurer portal records.
 */

import type { OutcomeCreatedPayload, SensitiveField } from "@voicebridge/contracts";
import { Panel, Pill } from "./ui";

const FIELD_LABEL: Partial<Record<SensitiveField, string>> = {
  claim_number: "claim number",
  policy_id: "policy ID",
  address: "address",
  date_of_loss: "date of loss",
  phone_number: "phone number",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-vb-border/60 py-2 last:border-0 sm:flex-row sm:items-baseline sm:gap-3">
      <span className="w-44 shrink-0 text-xs uppercase tracking-wider text-vb-muted">
        {label}
      </span>
      <span className="text-sm text-vb-text">{children}</span>
    </div>
  );
}

export function OutcomeCard({ outcome }: { outcome: OutcomeCreatedPayload }) {
  return (
    <Panel title="Outcome" subtitle="call summary" accent="approve">
      <div className="flex flex-col">
        <Row label="Claim status">
          <Pill tone="warn">{outcome.claim_status}</Pill>
        </Row>
        {outcome.claim_number ? (
          <Row label="Claim number">
            <code className="text-vb-text">{outcome.claim_number}</code>
          </Row>
        ) : null}
        <Row label="Missing documents">
          {outcome.missing_documents.length
            ? outcome.missing_documents.map((d) => d.replace(/_/g, " ")).join(", ")
            : "none"}
        </Row>
        {outcome.deadline ? <Row label="Deadline">{outcome.deadline}</Row> : null}
        <Row label="Shared (approved)">
          {outcome.sensitive_info_shared.length ? (
            <span className="flex flex-wrap gap-1.5">
              {outcome.sensitive_info_shared.map((f) => (
                <Pill key={f} tone="approve">
                  {FIELD_LABEL[f] ?? f.replace(/_/g, " ")}
                </Pill>
              ))}
            </span>
          ) : (
            "nothing"
          )}
        </Row>
        {outcome.language_switch ? (
          <Row label="Language switch">
            {outcome.language_switch.from} → {outcome.language_switch.to}
          </Row>
        ) : null}
        {outcome.preference_learned ? (
          <Row label="Preference learned">{outcome.preference_learned}</Row>
        ) : null}
        {outcome.follow_up ? <Row label="Follow-up">{outcome.follow_up}</Row> : null}
      </div>
    </Panel>
  );
}
