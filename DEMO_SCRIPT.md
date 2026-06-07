# CommandOS Live Demo Script

**Claim:** CommandOS is a voice operating system for live business incidents.
**Demo:** Fintech payment failures in Texas, rendered as a live 3D operating surface.
**Rule:** no sponsor path may be presented as live unless `pnpm agent:live-check:strict`
passes.

---

## Hard Gate

Run this before building or presenting the frontend:

```powershell
pnpm agent:live-check
pnpm agent:live-check:strict
```

Strict readiness must pass. If it fails, the demo is blocked until the reported
provider or data source is fixed. Do not switch to a mock fallback for judging.

Current required live paths:

- LiveKit room/API
- ElevenLabs real TTS
- MiniMax real TTS with non-empty audio
- NVIDIA Nemotron real LLM call
- Qwen/DashScope real multilingual call
- UnSiloed real document parse
- MOSS real memory read/write
- TrueFoundry real gateway/guardrail call
- AWS real audit identity/store path
- CommandOS payment telemetry from `COMMANDOS_PAYMENTS_API_URL`
- CommandOS event stream with no `stub` or `local` sponsor events

SIP/PSTN is optional for this orb-first demo.

---

## Frontend-Independent Backend Flow

The frontend starts as a single orb. The backend must drive the whole flow over
typed events.

1. Operator says: "CommandOS, pull up recent payment failures."
2. CommandOS asks for missing scope if needed: time window, segment, region.
3. Operator says: "Last hour, premium customers, Texas."
4. Backend fetches real payment telemetry from `COMMANDOS_PAYMENTS_API_URL`.
5. Backend emits `map.hotspots` with real city-level failure points.
6. Backend emits `topology.built` with real/current payment-flow topology.
7. Operator asks: "Where is it failing?"
8. Backend localizes the failure point and emits `failure.localized`.
9. Operator asks: "Have we seen this before?"
10. Backend recalls a prior incident from MOSS and emits `memory.recalled`.
11. Backend parses/retrieves the live runbook through UnSiloed and emits
    `knowledge.retrieved`.
12. CommandOS proposes mitigation and emits `mitigation.proposed`.
13. Operator says: "Restart the payment gateway."
14. TrueFoundry guardrail blocks until queue depth and approval are present.
15. CommandOS asks whether to build the clean dashboard/report.
16. Operator says yes.
17. Backend emits `dashboard.generated`, `report.created`, `memory.written`,
    `outcome.created`, and `audit.saved`.

---

## What Judges Should Notice

1. The orb is conversational, not a dashboard with a chatbot bolted on.
2. The 3D scene changes because the operator speaks, chooses, and approves.
3. The map is backed by real telemetry, not hardcoded city points.
4. The memory suggestion changes the mitigation path.
5. The risky restart is blocked by a real guardrail path.
6. The final report and dashboard are generated from the same event stream.

---

## Blocked Means Blocked

If strict readiness reports a blocker, say it plainly during internal prep and
fix the credential/source. Do not present these as live:

- local MOSS-shaped memory
- local UnSiloed fixture
- local TrueFoundry guardrail function
- local AWS audit record
- scripted payment hotspots
- browser-only or zero-byte voice synthesis

The demo can still be developed offline, but the judged live flow cannot claim
those paths are working.
