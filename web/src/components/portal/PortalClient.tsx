"use client";

/**
 * Portal client shell (Agent 7 + Agent 1 seam).
 *
 * Wraps the dashboard in Agent 1's <CallProvider role="observer">, which mints an
 * observer token via /api/token and provides the LiveKit RoomContext that
 * `useVoiceBridgeEvents` reads. Observer = watch only; CallProvider never enables
 * the mic for this role. We auto-connect so the portal starts watching the live
 * call immediately on load.
 *
 * If the room is unreachable (LiveKit env unconfigured / no agent), CallProvider
 * lands in `idle`/`error` with a still-valid RoomContext, so PortalDashboard's
 * standalone mock ("Replay demo") remains fully demoable.
 */

import { CallProvider } from "@/components/CallProvider";
import { PortalDashboard } from "./PortalDashboard";
import { type IntegrationModes } from "./SponsorBadges";

export function PortalClient({ modes }: { modes: IntegrationModes }) {
  return (
    <CallProvider role="observer" autoConnect>
      <PortalDashboard modes={modes} />
    </CallProvider>
  );
}
