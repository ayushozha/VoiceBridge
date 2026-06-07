"use client";

/**
 * CallProvider (Agent 1: call infrastructure).
 *
 * Owns a single LiveKit `Room` for the page and exposes connect / disconnect via
 * context. Wraps children in `RoomContext.Provider` so `useRoomContext` and the
 * shared `useVoiceBridgeEvents` hook work anywhere below it. Renders
 * `RoomAudioRenderer` (plays the agent's TTS output) and `StartAudio` (clears the
 * browser autoplay gate on first interaction).
 *
 * Usage:
 *   <CallProvider role="user">
 *     <UserConsole />   // calls useCall() to connect; useVoiceBridgeEvents() to read
 *   </CallProvider>
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { RoomAudioRenderer, RoomContext, StartAudio } from "@livekit/components-react";
import { ConnectionState, type Room } from "livekit-client";
import { createRoom, fetchToken, type CallRole, type TokenResponse } from "@/lib/livekit";

export type CallStatus = "idle" | "connecting" | "connected" | "error";

export interface CallContextValue {
  room: Room;
  status: CallStatus;
  error: string | null;
  /** Server-resolved identity/room once connected. */
  connection: TokenResponse | null;
  /** Whether the local mic track is enabled (user role only). */
  micEnabled: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  setMicEnabled: (on: boolean) => Promise<void>;
}

const CallContext = createContext<CallContextValue | null>(null);

/** Read the call context. Throws if used outside <CallProvider>. */
export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within <CallProvider>");
  return ctx;
}

export interface CallProviderProps {
  children: React.ReactNode;
  /** Participant role. `user` publishes mic; `observer` (portal) watches only. */
  role?: CallRole;
  /** Override identity/room (defaults come from the token route + env). */
  identity?: string;
  room?: string;
  /** Connect automatically on mount. Defaults to false (explicit user action). */
  autoConnect?: boolean;
  /** Enable the mic immediately after connecting (user role). Defaults to true. */
  enableMicOnConnect?: boolean;
}

export function CallProvider({
  children,
  role = "user",
  identity,
  room: roomName,
  autoConnect = false,
  enableMicOnConnect = true,
}: CallProviderProps) {
  // One Room instance for the provider's lifetime.
  const [room] = useState<Room>(() => createRoom());
  const [status, setStatus] = useState<CallStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<TokenResponse | null>(null);
  const [micEnabled, setMicEnabledState] = useState<boolean>(false);
  const connectingRef = useRef<boolean>(false);

  const connect = useCallback(async () => {
    if (connectingRef.current) return;
    if (
      room.state === ConnectionState.Connected ||
      room.state === ConnectionState.Connecting
    ) {
      return;
    }
    connectingRef.current = true;
    setStatus("connecting");
    setError(null);
    try {
      const token = await fetchToken({ role, identity, room: roomName });
      await room.connect(token.serverUrl, token.token);
      setConnection(token);
      setStatus("connected");
      if (role !== "observer" && enableMicOnConnect) {
        await room.localParticipant.setMicrophoneEnabled(true);
        setMicEnabledState(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      setStatus("error");
    } finally {
      connectingRef.current = false;
    }
  }, [room, role, identity, roomName, enableMicOnConnect]);

  const disconnect = useCallback(async () => {
    await room.disconnect();
    setStatus("idle");
    setConnection(null);
    setMicEnabledState(false);
  }, [room]);

  const setMicEnabled = useCallback(
    async (on: boolean) => {
      if (role === "observer") return;
      await room.localParticipant.setMicrophoneEnabled(on);
      setMicEnabledState(on);
    },
    [room, role],
  );

  // Keep status in sync with the room's own connection-state changes
  // (covers server-side disconnects and reconnects we didn't trigger).
  useEffect(() => {
    const onStateChanged = (state: ConnectionState) => {
      if (state === ConnectionState.Connected) setStatus("connected");
      else if (state === ConnectionState.Connecting) setStatus("connecting");
      else if (state === ConnectionState.Disconnected) {
        setStatus((prev) => (prev === "error" ? prev : "idle"));
        setMicEnabledState(false);
      }
    };
    room.on("connectionStateChanged", onStateChanged);
    return () => {
      room.off("connectionStateChanged", onStateChanged);
    };
  }, [room]);

  // Auto-connect once, if requested. Disconnect on unmount. The connect call is
  // deferred to a microtask so the effect body itself never triggers a
  // synchronous setState (cascading-render lint rule).
  useEffect(() => {
    if (autoConnect) queueMicrotask(() => void connect());
    return () => {
      void room.disconnect();
    };
    // connect is stable for the same inputs; we intentionally run this once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  const value = useMemo<CallContextValue>(
    () => ({
      room,
      status,
      error,
      connection,
      micEnabled,
      connect,
      disconnect,
      setMicEnabled,
    }),
    [room, status, error, connection, micEnabled, connect, disconnect, setMicEnabled],
  );

  return (
    <RoomContext.Provider value={room}>
      <CallContext.Provider value={value}>
        {/* Plays the agent's audio output. Safe to render before connect. */}
        <RoomAudioRenderer />
        {/* Clears the browser autoplay gate; renders nothing once audio runs. */}
        <StartAudio label="Click to enable call audio" />
        {children}
      </CallContext.Provider>
    </RoomContext.Provider>
  );
}
