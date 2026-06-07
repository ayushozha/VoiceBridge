"use client";

/**
 * Runtime trace — the live, ordered feed of contract events mapped to sponsors.
 *
 * This is the judge-facing proof that every sponsor does real work: MOSS recall
 * with scores + matched memory, UnSiloed document provenance, TrueFoundry
 * guardrail decisions, Qwen language switch, MiniMax/ElevenLabs voice with
 * latency, AWS/local audit. Newest event first.
 */

import { type VoiceBridgeEvent } from "@voicebridge/contracts";
import { SPONSOR_META, sponsorForEvent, traceHeadline } from "@/lib/sponsors";

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour12: false, minute: "2-digit", second: "2-digit" });
}

function ScorePill({ score }: { score?: number }) {
  if (typeof score !== "number") return null;
  return (
    <span className="rounded bg-vb-surface px-1.5 py-0.5 text-[10px] font-medium text-vb-accent-2">
      score {score.toFixed(2)}
    </span>
  );
}

/** Render the per-event detail lines (scores, matches, decisions, latency). */
function TraceDetail({ event }: { event: VoiceBridgeEvent }) {
  switch (event.type) {
    case "memory.recalled":
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-vb-muted">{event.payload.source.toUpperCase()}</span>
            <ScorePill score={event.payload.score} />
          </div>
          <ul className="space-y-0.5">
            {event.payload.summary.map((line, i) => (
              <li key={i} className="text-[11px] text-vb-text/80">
                · {line}
              </li>
            ))}
          </ul>
        </div>
      );
    case "knowledge.retrieved":
      return (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-vb-muted">{event.payload.source.toUpperCase()}</span>
            <ScorePill score={event.payload.score} />
            {event.payload.document && (
              <span className="rounded bg-vb-surface px-1.5 py-0.5 text-[10px] text-vb-accent">
                {event.payload.document}
              </span>
            )}
          </div>
          <ul className="space-y-0.5">
            {event.payload.matches.map((m, i) => (
              <li key={i} className="text-[11px] text-vb-text/80">
                · {m}
              </li>
            ))}
          </ul>
        </div>
      );
    case "guardrail.checked":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
              event.payload.decision === "block"
                ? "bg-vb-danger/15 text-vb-danger"
                : "bg-vb-accent-2/15 text-vb-accent-2"
            }`}
          >
            {event.payload.decision}
          </span>
          <span className="text-[11px] text-vb-text/80">{event.payload.reason}</span>
          <span className="text-[10px] text-vb-muted">via {event.payload.enforced_by}</span>
        </div>
      );
    case "language.switched":
      return (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-medium text-vb-text">
            {event.payload.from} → {event.payload.to}
          </span>
          <span className="text-vb-muted">detected by {event.payload.detected_by}</span>
          {event.payload.context_preserved && (
            <span className="rounded bg-vb-accent-2/15 px-1.5 py-0.5 text-[10px] text-vb-accent-2">
              claim context preserved
            </span>
          )}
        </div>
      );
    case "voice.spoken":
      return (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-vb-muted">
            <span className="uppercase">{event.payload.provider}</span>
            <span>· {event.payload.language}</span>
            {typeof event.payload.latency_ms === "number" && (
              <span className="rounded bg-vb-surface px-1.5 py-0.5 font-medium text-vb-accent-2">
                {event.payload.latency_ms} ms to first audio
              </span>
            )}
          </div>
          <p className="text-[11px] italic text-vb-text/80">&ldquo;{event.payload.text}&rdquo;</p>
        </div>
      );
    case "memory.written":
      return (
        <div className="space-y-0.5 text-[11px]">
          <span className="text-vb-muted">
            {event.payload.source.toUpperCase()} · {event.payload.event}
          </span>
          {(event.payload.before !== undefined || event.payload.after !== undefined) && (
            <p className="text-vb-text/70">
              {JSON.stringify(event.payload.before)} → {JSON.stringify(event.payload.after)}
            </p>
          )}
        </div>
      );
    case "audit.saved":
      return (
        <p className="text-[11px] text-vb-text/80">
          <span className="text-vb-muted">{event.payload.store.toUpperCase()}</span> ·{" "}
          {event.payload.event} ·{" "}
          <code className="text-vb-text/70">{event.payload.record_id}</code>
        </p>
      );
    case "consent.requested":
      return (
        <p className="text-[11px] text-vb-text/80">
          would say: &ldquo;{event.payload.proposed_disclosure}&rdquo; ({event.payload.rule})
        </p>
      );
    case "consent.approved":
    case "consent.denied":
      return (
        <p className="text-[11px] text-vb-text/80">
          {event.payload.shared_value
            ? `shared: ${event.payload.shared_value}`
            : event.payload.alternate
              ? `alternate: ${event.payload.alternate}`
              : "no value disclosed"}
        </p>
      );
    case "agent.utterance":
    case "insurer.utterance":
      return <p className="text-[11px] italic text-vb-text/80">&ldquo;{event.payload.text}&rdquo;</p>;
    case "user.intent":
      return <p className="text-[11px] italic text-vb-text/80">&ldquo;{event.payload.text}&rdquo;</p>;
    case "user.choice":
      return <p className="text-[11px] text-vb-text/80">{event.payload.choice}</p>;
    case "user.correction":
      return (
        <p className="text-[11px] text-vb-text/80">
          {event.payload.kind}
          {event.payload.scope ? ` · ${event.payload.scope}` : ""}
        </p>
      );
    case "call.started":
      return event.payload.intent ? (
        <p className="text-[11px] italic text-vb-text/80">&ldquo;{event.payload.intent}&rdquo;</p>
      ) : null;
    case "call.agent_joined":
    case "call.audio_ready":
    case "outcome.created":
      return null;
  }
}

function TraceRow({ event, isFirst }: { event: VoiceBridgeEvent; isFirst: boolean }) {
  const sponsor = sponsorForEvent(event);
  const meta = sponsor ? SPONSOR_META[sponsor] : null;
  return (
    <li className="relative pl-7">
      {/* Timeline spine */}
      <div className="absolute left-[9px] top-0 h-full w-px bg-vb-border/40" aria-hidden />
      {/* Dot */}
      <span
        className={`absolute left-0 top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border ${
          meta
            ? `border-current bg-vb-surface ${meta.accent}`
            : "border-vb-border bg-vb-surface-2 text-vb-border"
        } ${isFirst ? "shadow-[0_0_6px_currentColor] opacity-90" : ""}`}
        aria-hidden
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      <div className="rounded-lg border border-vb-border/40 bg-vb-surface-2/50 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-medium text-vb-text">{traceHeadline(event)}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-vb-muted">
            {timeLabel(event.timestamp)}
          </span>
        </div>
        {meta && (
          <span className={`mt-0.5 block text-[10px] font-semibold uppercase tracking-wide ${meta.accent}`}>
            {meta.label}
          </span>
        )}
        <div className="mt-1.5">
          <TraceDetail event={event} />
        </div>
      </div>
    </li>
  );
}

export function RuntimeTrace({ events }: { events: readonly VoiceBridgeEvent[] }) {
  const ordered = [...events].reverse(); // newest first
  return (
    <section className="flex h-full flex-col rounded-xl border border-vb-border bg-vb-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-vb-text">Runtime trace</h2>
        <span className="rounded-full border border-vb-border bg-vb-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-widest text-vb-muted">
          {events.length} events
        </span>
      </div>
      {ordered.length === 0 ? (
        <p className="text-sm text-vb-muted">
          Waiting for call events. Replay the demo or start a live call to populate the trace.
        </p>
      ) : (
        <ol className="space-y-3 overflow-y-auto pr-1">
          {ordered.map((event, i) => (
            <TraceRow key={`${event.type}-${event.timestamp}-${i}`} event={event} isFirst={i === 0} />
          ))}
        </ol>
      )}
    </section>
  );
}
