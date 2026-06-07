"use client";

/**
 * Sponsor badge row for the insurer portal.
 *
 * Shows every sponsor, its runtime role, and an honest live / stub / off status
 * derived from real env config (`integrationModes()` passed from the server).
 * A badge also lights up "active" the moment an event attributed to that sponsor
 * appears in the stream — so a judge sees each sponsor actually do work.
 */

import { type Sponsor, type VoiceBridgeEvent } from "@voicebridge/contracts";
import { SPONSOR_META, SPONSOR_ORDER, sponsorForEvent } from "@/lib/sponsors";

/** Live env truth, narrowed to the sponsors with env-backed config. */
export type IntegrationModes = Partial<Record<Sponsor, boolean>>;

type Status = "live" | "stub" | "off";

/**
 * Per-spec honesty: live sponsors when configured; otherwise faithful stub.
 * AWS + TrueFoundry are expected stubs in the hackathon; MOSS/UnSiloed/Qwen
 * also have local sponsor-shaped adapters until their live flags are enabled.
 * Anything env says is off but still has a working local adapter shows as
 * "stub" rather than "off".
 */
function statusFor(id: Sponsor, modes: IntegrationModes): Status {
  if (modes[id]) return "live";
  // These have faithful local adapters/fallbacks even when env is unset.
  const stubbable: Sponsor[] = [
    "truefoundry",
    "aws",
    "moss",
    "unsiloed",
    "qwen",
    "minimax",
    "elevenlabs",
  ];
  return stubbable.includes(id) ? "stub" : "off";
}

const STATUS_STYLE: Record<Status, string> = {
  live: "border-vb-accent-2/50 text-vb-accent-2",
  stub: "border-vb-warn/50 text-vb-warn",
  off: "border-vb-border text-vb-muted",
};

const STATUS_LABEL: Record<Status, string> = {
  live: "Live",
  stub: "Stub",
  off: "Off",
};

export function SponsorBadges({
  modes,
  events,
}: {
  modes: IntegrationModes;
  events: readonly VoiceBridgeEvent[];
}) {
  const active = new Set<Sponsor>();
  for (const e of events) {
    const s = sponsorForEvent(e);
    if (s) active.add(s);
  }

  return (
    <section className="rounded-xl border border-vb-border bg-vb-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-vb-text">Sponsor runtime</h2>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-vb-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-vb-accent-2" />
            Live
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-vb-warn" />
            Stub
          </span>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SPONSOR_ORDER.map((id) => {
          const meta = SPONSOR_META[id];
          const status = statusFor(id, modes);
          const isActive = active.has(id);
          return (
            <li
              key={id}
              title={meta.role}
              className={`rounded-lg border bg-vb-surface-2 p-3 transition ${
                isActive ? "border-vb-accent ring-1 ring-vb-accent/40" : "border-vb-border"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-vb-text">{meta.label}</span>
                <span
                  className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${STATUS_STYLE[status]}`}
                >
                  {STATUS_LABEL[status]}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-vb-muted">
                {meta.role}
              </p>
              <span
                className={`mt-2 flex items-center gap-1 text-[10px] ${
                  isActive ? "text-vb-accent" : "text-vb-muted/60"
                }`}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    isActive ? "bg-vb-accent" : "bg-vb-border"
                  }`}
                />
                {isActive ? "active this call" : "idle"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
