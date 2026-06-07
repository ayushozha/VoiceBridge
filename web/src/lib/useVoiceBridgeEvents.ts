"use client";

/**
 * Typed bridge over the LiveKit data channel for VoiceBridge contract events.
 *
 * Shared by the user console (Agent 6) and insurer portal (Agent 7). Decodes
 * inbound packets into typed `VoiceBridgeEvent`s and exposes a `publish` for
 * outbound user.* events. Until the brain (Codex) is wired, callers can drive
 * the UI from a local mock stream using the same `VoiceBridgeEvent` shape.
 */

import { useCallback, useEffect, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import {
  EVENT_TOPIC,
  decodeEvent,
  encodeEvent,
  makeEvent,
  type EventPayloadMap,
  type EventType,
  type VoiceBridgeEvent,
} from "@voicebridge/contracts";

export interface UseVoiceBridgeEvents {
  /** Ordered log of every contract event seen this session. */
  events: VoiceBridgeEvent[];
  /** The most recent event, or null. */
  latest: VoiceBridgeEvent | null;
  /** Publish a typed event to all participants (e.g. user.intent). */
  publish: <T extends EventType>(type: T, payload: EventPayloadMap[T]) => Promise<void>;
  /** Inject an event locally without sending it (for mock-driven demos). */
  inject: (event: VoiceBridgeEvent) => void;
}

export function useVoiceBridgeEvents(): UseVoiceBridgeEvents {
  const room = useRoomContext();
  const [events, setEvents] = useState<VoiceBridgeEvent[]>([]);

  const record = useCallback((event: VoiceBridgeEvent) => {
    setEvents((prev) => [...prev, event]);
  }, []);

  useEffect(() => {
    if (!room) return;
    const onData = (payload: Uint8Array, _participant?: unknown, _kind?: unknown, topic?: string) => {
      if (topic && topic !== EVENT_TOPIC) return;
      const event = decodeEvent(payload);
      if (event) record(event);
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, record]);

  const publish = useCallback(
    async <T extends EventType>(type: T, payload: EventPayloadMap[T]) => {
      // makeEvent<T> yields EventEnvelope<T, …>, which is a valid member of the
      // VoiceBridgeEvent union but TS can't prove that for a generic T. The cast
      // is sound: type + payload come from the same EventPayloadMap entry.
      const event = makeEvent(type, payload) as VoiceBridgeEvent;
      record(event);
      if (room?.localParticipant) {
        await room.localParticipant.publishData(encodeEvent(event), {
          reliable: true,
          topic: EVENT_TOPIC,
        });
      }
    },
    [room, record],
  );

  const latest = events.length > 0 ? events[events.length - 1]! : null;
  return { events, latest, publish, inject: record };
}
