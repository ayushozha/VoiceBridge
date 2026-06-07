"use client";

/**
 * Client shell for the Incident HUD page.
 *
 * Two modes:
 *   1. Demo (default): plays the INCIDENT_MOCK_STEPS sequence standalone.
 *   2. Live: if NEXT_PUBLIC_LIVEKIT_URL is configured, wraps with CallProvider
 *      and wires the real VoiceBridgeEvent stream from CommandOSOrchestrator.
 */

import { IncidentHUD } from "@/components/IncidentHUD";

export function IncidentHUDPage() {
  // The IncidentHUD component handles both demo and event-driven modes.
  // For live mode, pass externalEvents from useVoiceBridgeEvents here.
  return <IncidentHUD />;
}
