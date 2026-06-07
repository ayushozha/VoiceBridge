"use client";

/**
 * Graceful-degradation wrapper for the User Console.
 *
 * `useVoiceBridgeEvents` calls `useRoomContext()`, which THROWS when no
 * `RoomContext` provider exists above it. Agent 1 owns the real `<CallProvider>`
 * (a connected Room behind a RoomContext.Provider). Until that lands — or when
 * the console is run standalone for the mock demo — we provide our own
 * RoomContext with a disconnected Room so the hook resolves to a valid room
 * object instead of crashing.
 *
 * If a real room IS already provided above us (Agent 1 wrapped /console), we
 * detect it with `useMaybeRoomContext` and render children directly, so we never
 * shadow the live connected room.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RoomContext, useMaybeRoomContext } from "@livekit/components-react";
import { Room } from "livekit-client";

function FallbackProvider({ children }: { children: ReactNode }) {
  // A single disconnected Room for the session. It has a localParticipant, so
  // the hook's `publish` guard passes; publishData rejects on a disconnected
  // room, which the page tolerates (the local record already updated the UI).
  const [room] = useState(() => new Room());
  useEffect(() => {
    return () => {
      void room.disconnect();
    };
  }, [room]);
  return <RoomContext.Provider value={room}>{children}</RoomContext.Provider>;
}

/**
 * Renders children under a RoomContext no matter what:
 *  - real room present above  → pass through (live mode)
 *  - no room                  → provide a disconnected fallback (mock mode)
 *
 * Exposes `live` to children via a render prop so the page can show the right
 * connection affordance.
 */
export function RoomFallback({
  children,
}: {
  children: (live: boolean) => ReactNode;
}) {
  const existing = useMaybeRoomContext();
  const live = useMemo(() => Boolean(existing), [existing]);

  if (existing) return <>{children(true)}</>;
  return <FallbackProvider>{children(false)}</FallbackProvider>;
}
