# VoiceBridge

> The business-deployed conversational access layer for high-stakes insurance and
> financial-service phone workflows — memory-aware, consent-aware, multilingual.

![status](https://img.shields.io/badge/status-hackathon%20MVP-blue)
![stack](https://img.shields.io/badge/web-Next.js%2016%20%2B%20React%2019-black)
![agent](https://img.shields.io/badge/agent-LiveKit%20Agents%201.5%20(Python)-orange)
![voice](https://img.shields.io/badge/voice-ElevenLabs%20%2B%20MiniMax-38d9a9)
![memory](https://img.shields.io/badge/memory-MOSS-4f8cff)
![license](https://img.shields.io/badge/license-none%20checked%20in-lightgrey)

VoiceBridge is **B2B2C**: an institution (e.g. *Northstar Insurance*) deploys it so
policyholders, members, and caregivers who cannot reliably speak, hear, process, or
stay in one language can complete phone workflows through a memory-aware, consent-aware
AI communication proxy. It is **not** a consumer calling assistant.

See [`spec.md`](./spec.md) for the full product spec and [`tasks.md`](./tasks.md) for the
parallel build plan.

## Table of contents

- [Architecture](#architecture)
- [Repository map](#repository-map)
- [Quick start](#quick-start)
- [The shared contract](#the-shared-contract)
- [Sponsor integration status](#sponsor-integration-status)
- [Environment](#environment)
- [Verification](#verification)
- [Contributing invariants](#contributing-invariants)
- [License](#license)

## Architecture

Two halves joined by one [shared contract](#the-shared-contract):

```
                          ┌─────────────────────────────────────────────┐
   Browser (Next.js)      │  SURFACE  (this build: Agents 1, 2, 6, 7)    │
   ┌───────────────┐      │                                             │
   │ /console (6)  │◄────►│  web/  Next.js 16 · /api/token mints LiveKit │
   │ /portal   (7) │      │        JWT · typed event bus over data chan  │
   └───────┬───────┘      │  agent/ Python LiveKit worker (1) + voice (2)│
           │ WebRTC       └───────────────────────┬─────────────────────┘
           ▼                                       │ contract events
   ┌───────────────┐                               │ + agent-tool calls
   │ LiveKit room  │◄──── voice agent joins ───────┤
   └───────────────┘                               ▼
                          ┌─────────────────────────────────────────────┐
                          │  BRAIN  (Codex: Agents 3, 4, 5, 8, 9)        │
                          │  orchestrator · MOSS memory · consent/guard  │
                          │  · UnSiloed docs · Qwen multilingual         │
                          └─────────────────────────────────────────────┘
```

The surface carries and displays the call; the brain decides what to say. They agree
only through `contracts/` — so both sides build in parallel against the same types.

## Repository map

| Path | Role |
| --- | --- |
| `contracts/` | **The seam.** Event protocol + agent-tool surface + demo ids. Canonical `events.json`, plus TS (`contracts/ts`) and Python (`contracts/python`) mirrors. |
| `web/` | Next.js 16 app. `/` landing, `/console` (Agent 6), `/portal` (Agent 7), `/api/token` LiveKit JWT mint. Imports `@voicebridge/contracts`. |
| `agent/` | `uv`-managed Python LiveKit agent. Call transport (Agent 1) + voice/TTS adapters (Agent 2). Imports `voicebridge_contract`. |
| `spec.md` | Product spec (positioning, MVP scope, demo script, sponsor fit). |
| `tasks.md` | Parallel build plan + event contract reference. |
| `.env` / `.env.example` | Shared credentials. `.env` is git-ignored. |

## Quick start

> Prereqs: Node ≥ 20 + pnpm ≥ 10.15, Python ≥ 3.10 (< 3.15), [`uv`](https://docs.astral.sh/uv/).
> Commands shown for PowerShell on Windows; they work unchanged in bash.

```powershell
# 1. Install web + contract deps (from repo root)
pnpm install

# 2. Build the shared TS contract (web depends on it)
pnpm --filter @voicebridge/contracts build

# 3. Set up the Python agent (installs deps + downloads VAD/turn-detector models)
pnpm agent:setup

# 4. Run the web app  (http://localhost:3000)
pnpm dev

# 5. In a second terminal, run the voice agent
pnpm agent:dev
```

Credentials live in `.env`, but key presence is not considered demo-ready. Run
`pnpm agent:live-check` to make real provider calls and
`pnpm agent:live-check:strict` before any judged live demo.

## The shared contract

Everything that crosses the surface↔brain boundary is defined once in `contracts/`:

- **Events** (`call.started` … `outcome.created`) flow as JSON over the LiveKit data
  channel, topic `voicebridge.events`, envelope
  `{ type, tenant_id, user_id, case_id, timestamp, payload }`.
- **Agent tools** — the 8 tools the voice agent exposes (`search_business_knowledge`,
  `recall_customer_context`, `remember_call_event`, `check_sensitive_disclosure`,
  `parse_business_document`, `route_guarded_model_call`, `detect_language_switch`,
  `speak_response`).
- **Demo ids** — `northstar_insurance` / `ayush_demo` / `home_claim_H-48291`.

`events.json` is canonical; the TS and Python files mirror it. Add an event/tool in all
three. See [`contracts/README.md`](./contracts/README.md).

## Sponsor integration status

Honest per spec. "Live" means the backend made a real provider call in the latest
`pnpm agent:live-check` run; key presence alone is not enough.

| Sponsor | Role | Status |
| --- | --- | --- |
| **LiveKit** | Real-time call transport | Verified live: room API reachable |
| **MOSS** | Memory + retrieval | Verified live: SDK index create/load/query/write succeeded |
| **UnSiloed** | Document parsing | Verified live: tiny PDF parse succeeded |
| **ElevenLabs** | Low-latency TTS (default) | Verified live: real PCM audio synthesized |
| **MiniMax** | Low-latency TTS (sponsor path) | Blocked: API returns insufficient balance |
| **Qwen / Alibaba** | Multilingual reasoning | Blocked: missing `DASHSCOPE_API_KEY` |
| **TrueFoundry** | Model gateway + guardrails | Blocked: missing gateway credentials/base URL/model |
| **AWS** | Hosting + audit store | Blocked: missing AWS access key/secret |
| **CommandOS telemetry** | Real payment-failure map | Blocked: missing `COMMANDOS_PAYMENTS_API_URL` |

¹ The first-party `livekit-plugins-minimax` pins `livekit-agents==1.2.9`, which conflicts
with the latest 1.5.x core. To stay on the latest stack, MiniMax is implemented as a local
TTS adapter (`agent/voicebridge_agent/voice/`) that mirrors the same provider contract.

## Environment

`.env` (git-ignored) holds all credentials; `.env.example` is the committed template.
Placeholders use `<angle_brackets>` and are treated as "not configured" by both
`web/src/lib/env.ts` and `agent/voicebridge_agent/config.py`.

## Verification

```powershell
pnpm --filter @voicebridge/contracts build   # TS contract compiles
pnpm --filter @voicebridge/web typecheck     # web typechecks against the contract
pnpm --filter @voicebridge/web lint          # eslint (flat config)
pnpm --filter @voicebridge/web build         # next build
cd agent; uv run ruff check .                # agent lint (after uv sync)
pnpm agent:live-check                        # real provider readiness
pnpm agent:live-check:strict                 # required before live judging
```

## Contributing invariants

Preserve these — they are the product, not decoration:

1. **Consent before sensitive disclosure.** The agent never speaks a sensitive field
   (claim number, policy id, address, …) before an explicit `consent.approved`.
2. **No claim/financial/legal decisions.** The agent expresses intent, asks, and
   summarizes — it never approves/denies claims or gives advice.
3. **Memory is scoped.** Every MOSS read/write carries `{ tenant_id, user_id, case_id }`.
4. **One contract.** Cross-boundary changes go through `contracts/` in all three mirrors.
5. **PR-only.** No direct pushes to `main`; every change lands via a reviewed PR.

## License

No license file is currently checked in.
