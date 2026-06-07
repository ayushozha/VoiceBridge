"""VoiceBridge conversation brain package.

This package owns Agents 3, 4, 5, 8, and 9: deterministic orchestration,
MOSS-shaped memory, consent/guardrails, UnSiloed-shaped knowledge, and
Qwen-shaped multilingual behavior.
"""

from voicebridge_brain.orchestrator import DemoOrchestrator, run_scripted_demo

__all__ = ["DemoOrchestrator", "run_scripted_demo"]
