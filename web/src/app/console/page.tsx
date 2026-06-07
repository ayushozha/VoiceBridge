"use client";

/**
 * User Console (Agent 6) — the member-facing control surface.
 *
 * The member drives the WHOLE demo here without speaking: enter intent, approve
 * sensitive disclosures, pick quick choices, switch language, correct tone — and
 * read a live transcript + context feed.
 *
 * Everything is driven off the typed VoiceBridge event stream via
 * `useVoiceBridgeEvents()`:
 *  - inbound brain/insurer events render prompts, transcript, context, outcome.
 *  - member actions `publish` user.* events (and locally record them).
 *
 * Standalone path: when no live LiveKit room is wired (Agent 1's CallProvider
 * not present), `RoomFallback` supplies a disconnected room and `useMockPlayer`
 * replays the spec.md demo via `inject()` so the full flow is demonstrable.
 */

import { useCallback, useMemo, useState } from "react";
import {
  DEMO,
  type ConsentRequestedPayload,
  type CorrectionKind,
  type EventPayloadMap,
  type EventType,
  type LanguageCode,
  type OutcomeCreatedPayload,
  type VoiceBridgeEvent,
} from "@voicebridge/contracts";
import { useVoiceBridgeEvents } from "@/lib/useVoiceBridgeEvents";
import { CallProvider, useMaybeCall } from "@/components/CallProvider";
import { RoomFallback } from "@/components/console/RoomFallback";
import { useMockPlayer } from "@/components/console/useMockPlayer";
import { IntentInput } from "@/components/console/IntentInput";
import { ConsentPrompt, type ConsentDecision } from "@/components/console/ConsentPrompt";
import { ChoiceButtons } from "@/components/console/ChoiceButtons";
import { LanguageSwitch } from "@/components/console/LanguageSwitch";
import { CorrectionBar } from "@/components/console/CorrectionBar";
import { TranscriptView, deriveTranscript } from "@/components/console/TranscriptView";
import { ContextPanel, deriveContext } from "@/components/console/ContextPanel";
import { OutcomeCard } from "@/components/console/OutcomeCard";
import { ConsoleButton, Pill } from "@/components/console/ui";
import Link from "next/link";

export default function ConsolePage() {
  // Agent 1's CallProvider supplies the live RoomContext (member role, mic on).
  // RoomFallback stays as a safety net: it guarantees a RoomContext for
  // useVoiceBridgeEvents even if the provider is ever removed, and passes through
  // when CallProvider is present. Liveness is derived inside ConsoleInner from the
  // actual connection status, not from "a RoomContext exists".
  return (
    <CallProvider role="user" enableMicOnConnect>
      <RoomFallback>{() => <ConsoleInner />}</RoomFallback>
    </CallProvider>
  );
}

/** Latest pending choice the agent surfaced to the member, if unanswered. */
function pendingChoice(
  events: VoiceBridgeEvent[],
): { prompt: string; options: string[] } | null {
  // The agent surfaces a choice via an agent.utterance ending in "?" that maps
  // to one of the spec's choice sets. We detect the demo's two choice beats by
  // their text and present matching options. A real brain would carry options
  // on the event; until then this keeps the console driving the demo.
  let prompt: string | null = null;
  let options: string[] = [];
  let answeredSince = false;
  for (const e of events) {
    if (e.type === "agent.utterance") {
      if (e.payload.text.includes("confirm this is the same claim")) {
        prompt = "They found your prior call. Confirm this is the same claim?";
        options = ["Confirm same claim", "Different claim", "Ask what they see"];
        answeredSince = false;
      } else if (e.payload.text.includes("What should I ask")) {
        prompt = "They need damage photos and a repair estimate. What should I ask?";
        options = ["Ask upload link", "Ask deadline", "Ask for adjuster"];
        answeredSince = false;
      }
    } else if (e.type === "user.choice") {
      answeredSince = true;
    }
  }
  return prompt && !answeredSince ? { prompt, options } : null;
}

/** Latest consent request that has not yet been answered. */
function pendingConsent(events: VoiceBridgeEvent[]): ConsentRequestedPayload | null {
  let req: ConsentRequestedPayload | null = null;
  for (const e of events) {
    if (e.type === "consent.requested") req = e.payload;
    else if (e.type === "consent.approved" || e.type === "consent.denied") req = null;
  }
  return req;
}

function latestOutcome(events: VoiceBridgeEvent[]): OutcomeCreatedPayload | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.type === "outcome.created") return e.payload;
  }
  return null;
}

function currentLanguage(events: VoiceBridgeEvent[]): LanguageCode {
  let lang: LanguageCode = "en";
  for (const e of events) {
    if (e.type === "language.switched") lang = e.payload.to;
  }
  return lang;
}

function appliedCorrections(events: VoiceBridgeEvent[]): Set<CorrectionKind> {
  const set = new Set<CorrectionKind>();
  for (const e of events) {
    if (e.type === "user.correction") set.add(e.payload.kind);
  }
  return set;
}

function ConsoleInner() {
  const { events, publish, inject, reset: resetEvents } = useVoiceBridgeEvents();
  const player = useMockPlayer(events, inject);
  const [callStarted, setCallStarted] = useState(false);
  const [copied, setCopied] = useState(false);
  // Present when wrapped in <CallProvider>; null otherwise. "live" means an
  // actual room connection, so the standalone mock stays available until the
  // member connects.
  const call = useMaybeCall();
  const live = call?.status === "connected";

  // On a disconnected (mock) room, publishData rejects. The hook records the
  // event locally before awaiting the network, so the UI is already updated;
  // we swallow the network rejection so mock mode never surfaces an error.
  const safePublish = useCallback(
    <T extends EventType>(type: T, payload: EventPayloadMap[T]) => {
      void publish(type, payload).catch(() => {});
    },
    [publish],
  );

  const language = useMemo(() => currentLanguage(events), [events]);
  const transcript = useMemo(() => deriveTranscript(events), [events]);
  const context = useMemo(() => deriveContext(events), [events]);
  const consent = useMemo(() => pendingConsent(events), [events]);
  const choice = useMemo(() => pendingChoice(events), [events]);
  const outcome = useMemo(() => latestOutcome(events), [events]);
  const corrections = useMemo(() => appliedCorrections(events), [events]);

  // --- member actions -----------------------------------------------------
  const handleIntent = useCallback(
    (text: string, lang: LanguageCode) => {
      setCallStarted(true);
      // In live mode, connecting on first intent joins the room + enables the
      // mic so the agent hears the member. connect() is idempotent. In mock
      // mode `call` is null and we just publish locally.
      if (call && call.status === "idle") void call.connect();
      safePublish("user.intent", { text, language: lang });
    },
    [safePublish, call],
  );

  const handleChoice = useCallback(
    (prompt: string, choiceValue: string) => {
      safePublish("user.choice", { prompt, choice: choiceValue });
    },
    [safePublish],
  );

  const handleConsent = useCallback(
    (request: ConsentRequestedPayload, decision: ConsentDecision) => {
      if (decision.kind === "approve") {
        safePublish("consent.approved", {
          field: request.field,
          shared_value: request.proposed_disclosure,
        });
      } else if (decision.kind === "deny") {
        safePublish("consent.denied", { field: request.field });
      } else if (decision.kind === "alternate") {
        safePublish("consent.denied", {
          field: request.field,
          alternate: decision.text,
        });
      }
    },
    [safePublish],
  );

  const handleLanguage = useCallback(
    (from: LanguageCode, to: LanguageCode) => {
      safePublish("language.switched", {
        from,
        to,
        detected_by: "local",
        context_preserved: true,
      });
    },
    [safePublish],
  );

  const handleCorrection = useCallback(
    (kind: CorrectionKind) => {
      safePublish("user.correction", { kind, scope: "insurance_claim_follow_up" });
    },
    [safePublish],
  );

  const handleReset = useCallback(() => {
    player.reset();
    resetEvents();
    setCallStarted(false);
  }, [player, resetEvents]);

  const handleCopyRoom = useCallback(() => {
    const room = call?.connection?.room ?? DEMO.caseId;
    void navigator.clipboard.writeText(room).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [call]);

  const started = callStarted || events.length > 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-vb-accent">
            {DEMO.tenantDisplayName} · User Console
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hi {DEMO.userDisplayName} — drive your call without speaking
          </h1>
          <p className="text-sm text-vb-muted">
            Case <code className="text-vb-text">{DEMO.caseId}</code>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {call ? (
            <>
              <Pill
                tone={
                  call.status === "connected"
                    ? "approve"
                    : call.status === "error"
                      ? "warn"
                      : call.status === "connecting"
                        ? "warn"
                        : "muted"
                }
              >
                {call.status === "connected"
                  ? "live call"
                  : call.status === "connecting"
                    ? "connecting…"
                    : call.status === "error"
                      ? "connection error"
                      : "ready"}
              </Pill>
              {live && call.micEnabled && (
                <Pill tone="approve">mic on</Pill>
              )}
              {live && !call.micEnabled && (
                <Pill tone="warn">mic off</Pill>
              )}
              {call.status === "connected" ? (
                <ConsoleButton tone="neutral" onClick={() => void call.disconnect()}>
                  End call
                </ConsoleButton>
              ) : call.status === "error" ? (
                <ConsoleButton tone="accent" onClick={() => void call.connect()}>
                  Reconnect
                </ConsoleButton>
              ) : (
                <ConsoleButton tone="accent" onClick={() => void call.connect()}>
                  Connect
                </ConsoleButton>
              )}
            </>
          ) : (
            <Pill tone="muted">mock demo</Pill>
          )}
          <Pill tone="accent">{language === "es" ? "Español" : "English"}</Pill>
        </div>
      </header>

      {/* Error detail — shown when connection fails so the operator sees why */}
      {call?.status === "error" && call.error && (
        <div className="rounded-xl border border-vb-warn/40 bg-vb-warn/5 px-4 py-3">
          <p className="text-xs font-medium text-vb-warn">Connection error</p>
          <p className="mt-1 font-mono text-xs text-vb-text/70">{call.error}</p>
          <p className="mt-1 text-xs text-vb-muted">
            Check that the server is running and LIVEKIT_API_KEY is set in{" "}
            <code>web/.env</code>, then click Reconnect.
          </p>
        </div>
      )}

      {/* Live room info — visible when connected so operator can share the room */}
      {live && call.connection && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-vb-accent/30 bg-vb-accent/5 px-4 py-3">
          <Pill tone="approve">live room</Pill>
          <span className="text-xs text-vb-muted">
            Room: <code className="text-vb-text">{call.connection.room}</code>
          </span>
          <span className="text-xs text-vb-muted">
            Identity: <code className="text-vb-text">{call.connection.identity}</code>
          </span>
          <ConsoleButton tone="neutral" className="py-1 text-xs" onClick={handleCopyRoom}>
            {copied ? "Copied!" : "Copy room"}
          </ConsoleButton>
          <Link
            href="/portal"
            target="_blank"
            className="rounded-lg border border-vb-border px-3 py-1 text-xs text-vb-muted transition hover:border-vb-accent hover:text-vb-text"
          >
            Open portal →
          </Link>
        </div>
      )}

      {/* Demo / operator controls bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-vb-border bg-vb-surface-2 px-4 py-3">
        {live ? (
          <>
            <Pill tone="approve">live call active — mic drives the agent</Pill>
            <Link
              href="/portal"
              target="_blank"
              className="rounded-lg border border-vb-border px-3 py-1.5 text-sm text-vb-muted transition hover:border-vb-accent hover:text-vb-text"
            >
              Open portal →
            </Link>
          </>
        ) : (
          <>
            <span className="text-sm text-vb-muted">
              Mock demo · no live room. Replay the scripted flow:
            </span>
            {!player.running ? (
              <ConsoleButton tone="accent" onClick={player.start}>
                Run mock demo
              </ConsoleButton>
            ) : (
              <>
                <span className="text-xs text-vb-muted">
                  Step {player.cursor}/{player.total}
                  {player.currentLabel ? ` · ${player.currentLabel}` : ""}
                </span>
                {player.awaiting ? (
                  <Pill tone="warn">waiting for your action</Pill>
                ) : (
                  <Pill tone="muted">playing…</Pill>
                )}
              </>
            )}
          </>
        )}
        {started && (
          <ConsoleButton tone="neutral" onClick={handleReset}>
            Reset log
          </ConsoleButton>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Left: controls */}
        <div className="flex flex-col gap-5">
          {/* The active prompt — consent gate takes priority over everything */}
          {consent ? (
            <ConsentPrompt
              request={consent}
              onDecide={(d) => handleConsent(consent, d)}
            />
          ) : choice ? (
            <ChoiceButtons
              prompt={choice.prompt}
              options={choice.options}
              onChoose={(c) => handleChoice(choice.prompt, c)}
            />
          ) : null}

          <IntentInput language={language} onSubmit={handleIntent} />
          <LanguageSwitch current={language} onSwitch={handleLanguage} />
          <CorrectionBar applied={corrections} onCorrect={handleCorrection} />

          {outcome ? <OutcomeCard outcome={outcome} /> : null}
        </div>

        {/* Right: live read-outs */}
        <div className="flex flex-col gap-5">
          <TranscriptView lines={transcript} />
          <ContextPanel items={context} />
        </div>
      </div>

      {!started ? (
        <p className="text-center text-xs text-vb-muted">
          Connect to start a live call, or run the mock demo to see the full flow.
        </p>
      ) : null}
    </main>
  );
}
