"use client";

/**
 * Portal room wrapper (Agent 7).
 *
 * The portal participant is an OBSERVER: it subscribes to the LiveKit data
 * channel to watch the live VoiceBridge event stream but never publishes audio,
 * video, or events. `useVoiceBridgeEvents` requires a LiveKit RoomContext, so:
 *
 *   - With an observer token  → render <LiveKitRoom> (audio/video default false),
 *     which connects and provides the RoomContext.
 *   - Without a token (standalone pitch / no creds) → provide a local, unconnected
 *     Room via RoomContext so the hook works and the scripted mock can drive the
 *     UI via inject().
 *
 * Either way `PortalDashboard` renders identically; only the event source differs.
 */

import { useMemo } from "react";
import { Room } from "livekit-client";
import { LiveKitRoom, RoomContext } from "@livekit/components-react";
import { PortalDashboard } from "./PortalDashboard";
import { type IntegrationModes } from "./SponsorBadges";

export interface PortalToken {
  token: string;
  serverUrl: string;
}

export function PortalRoom({
  modes,
  connection,
}: {
  modes: IntegrationModes;
  /** Observer connection details, or null to run standalone (mock-only). */
  connection: PortalToken | null;
}) {
  // Stable local room for the standalone path so the hook's RoomContext resolves.
  const localRoom = useMemo(() => new Room(), []);

  if (connection) {
    return (
      <LiveKitRoom
        serverUrl={connection.serverUrl}
        token={connection.token}
        connect
        // Observer: never capture or publish media.
        audio={false}
        video={false}
        className="contents"
      >
        <PortalDashboard modes={modes} liveRoom />
      </LiveKitRoom>
    );
  }

  return (
    <RoomContext.Provider value={localRoom}>
      <PortalDashboard modes={modes} liveRoom={false} />
    </RoomContext.Provider>
  );
}
