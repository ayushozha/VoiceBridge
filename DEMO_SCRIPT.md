# VoiceBridge — Judge Demo Script

**Claim:** H-48291 · Member: Ayush · Tenant: Northstar Insurance
**Goal:** Two minutes. Show B2B2C value — voice AI protecting a vulnerable member in a live insurance call.

---

## What Judges Should Notice

1. **No speaking required** — the member types an intent; the AI speaks on their behalf.
2. **Consent gate** — the claim number is blocked until the member approves sharing it.
3. **Memory recall** — the agent remembers context from a prior call (style, language, claim status).
4. **Language switch** — mid-call EN → ES with claim context preserved.
5. **Portal as evidence** — the insurer sees the full sponsor trace, consent audit, and outcome.
6. **Auditable by design** — every disclosure, guardrail check, and memory write is time-stamped.

---

## Pre-Demo Checklist (run before the demo)

```powershell
# Terminals needed: 2 (web + agent worker) or 1 (mock-only)

# Terminal 1 — web app
pnpm dev         # -> http://localhost:3000

# Terminal 2 — live agent worker (optional; mock works standalone)
pnpm agent:dev

# Smoke-check token API
curl http://localhost:3000/api/token?role=user
# Should return JSON with token, serverUrl, room, identity
```

Open two browser tabs:
- **Tab A:** http://localhost:3000/console  (member view)
- **Tab B:** http://localhost:3000/portal   (Northstar Insurance staff view)

---

## Live Call Path (preferred — agent worker running)

| Step | Action | What to show |
|------|--------|--------------|
| 1 | In Tab A, click **Connect** | Pill turns green: "live call". Mic pill appears. |
| 2 | Type intent: *"I need to follow up on my home insurance claim"* → Send | Agent joins room. Call state panel in portal says "In call". |
| 3 | Portal Tab B | Runtime trace populates: `memory.recalled` with prior claim notes. Sponsor badges light up. |
| 4 | Consent prompt appears in Tab A | Say: *"The agent found the claim number — now it asks before sharing it."* |
| 5 | Click **Share** | `consent.approved` in portal. Claim number flows to insurer. |
| 6 | Click **Español** language switch | `language.switched` appears in portal. Claim context preserved badge. |
| 7 | Demo ends naturally or click **End call** | Outcome card appears in portal: claim status, missing docs, deadline. |

---

## Mock Fallback Path (live agent unavailable)

Use this if the agent worker is not running or the room connection fails.

| Step | Action | What to show |
|------|--------|--------------|
| 1 | In Tab A, click **Run mock demo** | Scripted flow plays automatically with realistic pacing. |
| 2 | Pause at consent prompt | Show consent gate. Click **Share** to advance. |
| 3 | In Tab B, click **Replay mock demo** | Portal fills: trace, badges, consent log, outcome. |
| 4 | Point at Outcome card in Tab B | Show claim status, language switch, preference learned. |

*Disclosure: "This is a scripted demonstration of the exact event shapes the live system produces."*

---

## Recovery Playbook

| Problem | Fix |
|---------|-----|
| "connection error" in console | Check `web/.env` has `LIVEKIT_API_KEY`. Click **Reconnect**. |
| No audio from agent | Click mic pill; ensure browser mic permission granted. |
| Portal shows no events | Click **Replay mock demo** in portal; switch to mock path. |
| Agent worker crashes | `pnpm agent:dev` again; room rejoins automatically. |
| Wrong tab in focus | Open portal → link in console live-room bar. |

---

## Honest Sponsor Status

| Sponsor | Status | Notes |
|---------|--------|-------|
| LiveKit | Live | WebRTC room + data channel |
| ElevenLabs | Live | Primary TTS |
| MiniMax | Stub | Local REST adapter (first-party plugin incompatible with agents 1.5.x) |
| MOSS | Stub | Local memory shaped as MOSS events |
| UnSiloed | Stub | Local document knowledge |
| TrueFoundry | Stub | Local guardrail — credentials not present |
| Qwen | Off | `DASHSCOPE_API_KEY` not present |
| AWS | Stub | Local audit log — credentials not present |

---

## Pitch Framing (30 seconds)

> *"VoiceBridge is a B2B2C conversational access layer. Northstar Insurance deploys it so members like Ayush can drive a real phone call without speaking — typing an intent, approving what gets shared, switching language mid-call — while the AI speaks on their behalf. The insurer sees every sponsor action, every consent decision, and a structured outcome. No PII disclosed without member approval. Fully auditable."*
