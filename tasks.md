# VoiceBridge Remaining Work Plan

Status: Active completion plan
Date: 2026-06-07
Goal: finish the spec by proving the live voice-call demo, not just the mock demo.

## Current Truth

The project is not complete against `spec.md` yet.

Verified done:

- `pnpm build` passes.
- `pnpm lint` passes.
- `pnpm typecheck` passes.
- `pnpm brain:test` passes with 29 tests.
- `pnpm brain:lint` passes.
- `cd agent; uv run pytest` passes with 20 tests.
- `cd agent; uv run ruff check .` passes.
- Controlled insurer participant connected to LiveKit and emitted scripted insurer events.
- Web app is running locally on port 3000.
- Git working tree was clean before this task update.

Not yet verified:

- Main `pnpm agent:dev` voice agent starts reliably with useful logs.
- Browser user connects to the same LiveKit room as the agent.
- Browser mic audio reaches the agent.
- Agent speaks back in the browser with acceptable latency.
- Brain events are emitted live over the LiveKit data channel.
- Portal renders the live event stream rather than only mock replay.
- The full Ayush / H-48291 demo works end to end three times in a row.

## Finish Line

The demo is complete only when all of these are true:

1. User opens `/console` and starts the call.
2. VoiceBridge agent joins the LiveKit room.
3. Audio flows both directions.
4. Agent gives a spoken response.
5. Controlled insurer participant can join or simulated insurer events appear in the same live room.
6. Agent recalls Ayush's H-48291 context.
7. Claim number is blocked until consent is approved.
8. User switches English to Spanish and the claim context is preserved.
9. `/portal` shows the same live event stream, sponsor trace, consent log, and outcome.
10. Demo runs three consecutive times without manual code changes.

## Owner Split

Codex takes the backend, agent runtime, brain integration, sponsor adapters, and final verification because those are Python/event-contract/system-integration tasks.

Claude Code takes the browser UI, LiveKit front-end surfaces, portal trace, demo controls, and visual QA because those are the user-facing surfaces judges will see.

This keeps the split at exactly five tasks each:

- Codex: Agents 1, 3, 4, 5, 10
- Claude Code: Agents 2, 6, 7, 8, 9

## Agent 1: Live Agent Startup And Room Join

Owner: Codex

Why Codex:

- This is the main backend blocker.
- It requires Python LiveKit Agents debugging, process/log handling, and config validation.

Remaining work:

- Make `pnpm agent:dev` start reliably.
- Add startup logs that prove:
  - config loaded
  - LiveKit worker started
  - room/job accepted
  - agent session started
  - `call.started`, `call.agent_joined`, and `call.audio_ready` were emitted
- Remove or fix any silent startup/hang behavior.
- Add a short smoke command that imports and validates the worker without joining a room.
- Ensure `pnpm agent:dev` does not leave orphaned Python workers after failure.

Acceptance:

- `pnpm agent:dev` produces clear startup output within 10 seconds.
- When `/console` starts a call, the agent joins the same room.
- No zombie `voicebridge_agent.agent dev` processes remain after stopping.

Dependencies:

- LiveKit credentials in `.env`.
- Existing `agent/voicebridge_agent/agent.py`.
- Existing `web/src/app/api/token/route.ts`.

Blocked by:

- LiveKit cloud auth or worker dispatch issue.
- LiveKit Agents API mismatch.

Validation:

```powershell
pnpm agent:dev
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*voicebridge_agent.agent dev*' }
```

## Agent 2: Browser Live Call Console

Owner: Claude Code

Why Claude:

- This is the visible user-facing call surface.
- It requires browser testing, UI state, mic permissions, and clear failure messaging.

Remaining work:

- Verify `/console` connects to LiveKit using `CallProvider`.
- Confirm token fetch works from `/api/token?role=user`.
- Show connection status, room name, identity, mic state, and agent-joined state.
- Make mic permission failures obvious.
- Add a "Reconnect" and "Disconnect" path.
- Make mock replay clearly labeled as mock, not live.
- Prevent mock events from being mistaken for a real sponsor trace.

Acceptance:

- User clicks one button and joins the room as `ayush_demo`.
- UI shows live connection state.
- UI shows whether mic is active.
- If LiveKit connection fails, the user sees the exact error.

Dependencies:

- Agent 1 worker startup.
- `web/src/components/CallProvider.tsx`.
- `web/src/app/console/page.tsx`.

Blocked by:

- Token route failure.
- Browser mic permission denial.

Validation:

```powershell
pnpm dev
```

Then verify `/console` in browser.

## Agent 3: Brain To LiveKit Event Bridge

Owner: Codex

Why Codex:

- The brain is implemented but not wired into the live agent.
- This is event-contract and Python orchestration work.

Remaining work:

- Connect `voicebridge_brain.DemoOrchestrator` to the LiveKit agent runtime.
- Publish orchestrator events over `voicebridge.events`.
- Ensure live events use the same envelope as mocks.
- Add a controlled text-mode trigger for the demo path.
- Decide whether the first live pass is:
  - fully voice-driven, or
  - typed console event starts the deterministic brain flow
- Ensure memory, guardrail, knowledge, language, outcome, and audit events appear live.

Acceptance:

- Starting the demo from `/console` causes live `memory.recalled`, `knowledge.retrieved`, `guardrail.checked`, `language.switched`, `memory.written`, `outcome.created`, and `audit.saved` events.
- `/portal` sees those events without mock replay.
- Event payloads pass `isVoiceBridgeEvent`.

Dependencies:

- Agent 1 room join.
- Brain package under `brain/voicebridge_brain`.
- Shared contract under `contracts/`.

Blocked by:

- No reliable data-channel publisher from the agent process.

Validation:

```powershell
pnpm brain:test
pnpm typecheck
```

And a live room trace showing brain events.

## Agent 4: Voice Output And Latency Trace

Owner: Codex

Why Codex:

- Voice provider selection and TTS latency events live in the Python agent.
- The spec requires low-latency spoken responses, not just text.

Remaining work:

- Verify selected TTS provider in a real `AgentSession`.
- Emit `voice.spoken` after the agent speaks.
- Include provider and `latency_ms`.
- Prefer ElevenLabs first if stable.
- Use MiniMax only if the adapter works in the live pipeline.
- Keep browser/LiveKit fallback as last resort and label it honestly.
- Add a small one-shot voice latency check that does not require the full call.

Acceptance:

- Agent audibly speaks in browser.
- First response is acceptably fast for the demo.
- Portal trace shows `voice.spoken` with provider and latency.

Dependencies:

- Agent 1.
- Existing `agent/voicebridge_agent/voice/*`.

Blocked by:

- TTS provider auth failure.
- LiveKit TTS plugin/API mismatch.

Validation:

```powershell
cd agent
uv run pytest tests/test_voice.py
```

And a live browser audio check.

## Agent 5: Sponsor Truth And Live/Stub Adapters

Owner: Codex

Why Codex:

- This is backend adapter and honesty work.
- The spec allows faithful stubs, but the runtime trace must not overclaim.

Remaining work:

- Audit every sponsor status shown in `/portal`.
- Make event payloads honest:
  - local MOSS-shaped memory should say `source: "local"` unless live MOSS is actually called
  - local guardrail should say `enforced_by: "local"` unless TrueFoundry is actually called
  - local language detection should say `detected_by: "local"` unless Qwen is actually called
  - local audit should say `store: "local"` unless AWS is actually used
- If time permits, wire one live API beyond LiveKit:
  - MOSS live memory, or
  - UnSiloed parse, or
  - Qwen via DashScope if key becomes available
- Keep the portal badge distinction: Live, Stub, Off.

Acceptance:

- No mock or fallback path claims a sponsor is live when it is local.
- Portal still makes sponsor usage visible.
- Missing Qwen, TrueFoundry, and AWS credentials are clearly marked.

Current credential truth:

- LiveKit present.
- MOSS env values present.
- UnSiloed API key present.
- ElevenLabs present.
- MiniMax present.
- `DASHSCOPE_API_KEY` missing.
- TrueFoundry gateway credentials missing.
- AWS access credentials missing.

Dependencies:

- `web/src/lib/env.ts`.
- `web/src/lib/sponsors.ts`.
- `brain/voicebridge_brain/*`.

Blocked by:

- Missing live provider credentials.

Validation:

```powershell
pnpm build
pnpm typecheck
```

## Agent 6: Portal Live Runtime Trace

Owner: Claude Code

Why Claude:

- This is the business-facing demo surface.
- Judges need to see the trace, consent log, and outcome at a glance.

Remaining work:

- Verify `/portal` connects as observer.
- Ensure `/portal` receives live data-channel events.
- Add a clear Live/Mock indicator.
- Add empty/error states for:
  - no room
  - no events
  - token failure
  - disconnected observer
- Make sponsor trace visually obvious and accurate.
- Ensure outcome card is readable in one screenshot.

Acceptance:

- `/portal` shows live events from the same room as `/console`.
- Runtime trace updates without manual refresh.
- Mock replay is available but visibly labeled.

Dependencies:

- Agent 3 live event bridge.
- Existing portal components.

Blocked by:

- No live data-channel events.

Validation:

```powershell
pnpm dev
```

Then verify `/portal` in browser while `/console` demo runs.

## Agent 7: Demo Controls And Failure Recovery UI

Owner: Claude Code

Why Claude:

- This is presentation control and UX safety.
- During a hackathon demo, the team needs fast recovery buttons.

Remaining work:

- Add a small demo control surface visible to the operator:
  - Start live call
  - Start mock replay
  - Reset event log
  - Reconnect
  - Copy room name
  - Open portal
- Make all controls keyboard/mouse friendly.
- Add clear labels for "Live call" vs "Mock replay".
- Prevent duplicate mock/live streams from mixing silently.
- Add a "demo ready" checklist in the UI or portal header.

Acceptance:

- Operator can recover from a failed room connection without restarting the app.
- Operator can choose live or mock intentionally.
- Demo never silently falls back to mock while claiming live.

Dependencies:

- Agent 2 console connection state.
- Agent 6 portal trace state.

Blocked by:

- Missing UI state separation between mock and live modes.

Validation:

Manual browser check on `/console` and `/portal`.

## Agent 8: Browser QA, Responsiveness, And Screenshot Readiness

Owner: Claude Code

Why Claude:

- This is UI polish and judge-facing reliability.
- It needs browser inspection, responsive checks, and visual cleanup.

Remaining work:

- Verify `/console` and `/portal` at desktop and mobile widths.
- Ensure no text overflow or overlapping controls.
- Ensure consent prompt is prominent.
- Ensure runtime trace is readable when events accumulate.
- Ensure portal screenshot communicates:
  - B2B2C buyer
  - memory retrieval
  - consent gate
  - language switch
  - outcome
- Fix any layout issues caused by live event volume.

Acceptance:

- Desktop demo view is screenshot-ready.
- Mobile view is not broken.
- Text fits inside controls and cards.

Dependencies:

- Agents 2, 6, and 7.

Blocked by:

- Final live event shape changes.

Validation:

Browser screenshots at `/console` and `/portal`.

## Agent 9: Demo Script, Pitch Flow, And Submission Assets

Owner: Claude Code

Why Claude:

- This is front-of-house execution.
- It turns the working product into a two-minute judge demo.

Remaining work:

- Create the final operator script:
  - open console
  - start call
  - show memory recall
  - approve claim number
  - switch to Spanish
  - show outcome in portal
- Add a short visible "What judges should notice" note outside the app, not inside the main UI.
- Capture final screenshots if needed.
- Keep claims honest:
  - LiveKit live
  - local fallback where applicable
  - no fake live sponsor claims
- Prepare fallback script if main live agent fails.

Acceptance:

- Team can demo in under two minutes.
- Fallback mock path is ready and clearly described.
- Pitch matches actual runtime evidence.

Dependencies:

- Agents 1 through 8.

Blocked by:

- No stable live call path.

Validation:

Run the final script twice without editing code.

## Agent 10: End-To-End QA And Release Gate

Owner: Codex

Why Codex:

- This is system verification, process cleanup, and command evidence.
- It must distinguish "works in mocks" from "works live."

Remaining work:

- Create or document a single final run sequence.
- Run all validation:
  - `pnpm build`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm brain:test`
  - `pnpm brain:lint`
  - `cd agent; uv run pytest`
  - `cd agent; uv run ruff check .`
- Run the live demo three times.
- Record exact failures if any.
- Check for orphaned Python/node processes after demo.
- Confirm git working tree status and commit/push if remote permits.

Acceptance:

- Final report says one of:
  - complete and live-verified
  - complete with explicit local stubs
  - not complete, with exact blocker
- No background agent workers are left running unintentionally.
- Git status is understood before handoff.

Dependencies:

- All other agents.

Blocked by:

- Live call path not working.

Validation:

```powershell
pnpm build
pnpm lint
pnpm typecheck
pnpm brain:test
pnpm brain:lint
cd agent; uv run pytest
cd agent; uv run ruff check .
```

## Dependency Map

Hard dependencies:

- Agent 2 depends on Agent 1 for real live-call proof.
- Agent 3 depends on Agent 1 for publishing live brain events.
- Agent 4 depends on Agent 1 and Agent 3 for real `voice.spoken` trace events.
- Agent 6 depends on Agent 3 for live runtime trace.
- Agent 7 depends on Agents 2 and 6 for accurate mode controls.
- Agent 8 depends on Agents 2, 6, and 7 for final UI shape.
- Agent 9 depends on Agents 1 through 8 for final script.
- Agent 10 depends on all agents for the final release gate.

Can start immediately in parallel:

- Agent 1 can debug `pnpm agent:dev`.
- Agent 2 can verify `/console` token/mic/live UI state.
- Agent 3 can wire orchestrator events to the agent data channel.
- Agent 4 can test voice provider selection and latency event emission.
- Agent 5 can fix sponsor truth and live/stub labels.
- Agent 6 can verify portal observer state using existing mock/live hooks.
- Agent 7 can add demo controls.
- Agent 8 can do responsive QA against existing pages.
- Agent 9 can draft the operator script with placeholders.
- Agent 10 can keep the validation checklist running.

## Immediate Order

First 30 minutes:

1. Codex Agent 1: make `pnpm agent:dev` visibly start or produce a concrete error.
2. Claude Agent 2: verify `/console` can fetch a token and connect to room.
3. Codex Agent 3: publish brain events into the same LiveKit data-channel topic.
4. Claude Agent 6: verify `/portal` receives live data-channel events.

Next 60 minutes:

5. Codex Agent 4: prove audible agent response and `voice.spoken`.
6. Codex Agent 5: fix live/stub sponsor honesty.
7. Claude Agent 7: add demo controls and mode labels.
8. Claude Agent 8: browser QA and layout fixes.

Final 30 minutes:

9. Claude Agent 9: run final pitch script and capture screenshots.
10. Codex Agent 10: run full validation and final three-run gate.

## What Not To Do

- Do not add real SIP until browser-to-agent LiveKit works.
- Do not claim Qwen is live unless `DASHSCOPE_API_KEY` works.
- Do not claim TrueFoundry is live unless gateway credentials work.
- Do not claim AWS persistence unless an AWS write actually succeeds.
- Do not let mock replay silently stand in for a live call.
- Do not share or print secrets while debugging.
