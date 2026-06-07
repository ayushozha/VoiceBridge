# VoiceBridge Agent (Python / LiveKit)

This package is the **surface-side voice runtime**: it owns Agent 1 (call
infrastructure) and Agent 2 (low-latency voice). It joins the LiveKit room,
carries audio both ways, speaks responses, and emits `call.*` / `voice.*`
contract events. It does **not** own conversation logic, memory, consent, docs,
or multilingual reasoning — those are the brain (Agents 3/4/5/8/9) and reach the
agent as tool calls / events.

## Run

```bash
# From repo root:
pnpm agent:setup        # uv sync + download VAD/turn-detector model files
pnpm agent:dev          # uv run python -m voicebridge_agent.agent dev
# or talk in the terminal:
pnpm agent:console
```

## Stack (latest as of 2026-06-07)

- `livekit-agents[codecs]` 1.5.x — core voice pipeline + worker.
- `livekit-plugins-elevenlabs` — primary TTS (live, reliable).
- `livekit-plugins-openai` — Qwen (via `QWEN_BASE_URL`) + NVIDIA Nemotron LLM,
  both OpenAI-compatible.
- `livekit-plugins-silero` + `livekit-plugins-turn-detector` — VAD + turn taking.
- MiniMax TTS is a **local adapter** (`voice/minimax.py`), not the first-party
  plugin: that plugin pins `livekit-agents==1.2.9`, which conflicts with the
  latest core. The adapter keeps MiniMax in the voice path without holding the
  whole project back.

## Layout

```
voicebridge_agent/
  agent.py        # worker entrypoint (Agent 1): join room, wire pipeline, health
  config.py       # env + sponsor integration-mode resolution
  events.py       # publish contract events over the data channel
  voice/          # Agent 2: TTS adapter interface (elevenlabs / minimax / browser)
  transport/      # Agent 1: controlled insurer participant, health checks
```

## Contract

Import event/tool/demo definitions from `voicebridge_contract` (the shared
Python mirror). Never hardcode event-type strings — use the `EventType` Literal
and `make_event`.
