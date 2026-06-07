"use client";

/**
 * useAudioLevel - real-audio energy for the HUD orb.
 *
 * Attaches a native Web Audio `AnalyserNode` to (i) the local participant's
 * microphone and (ii) every remote audio track (the agent's TTS output), and
 * returns a smoothed 0..1 level representing "is something speaking right now".
 *
 * No new dependency: this is the browser-native Web Audio API. The LiveKit
 * `Room` only supplies the `MediaStreamTrack`s - a `Track` exposes its
 * underlying `mediaStreamTrack`, which we wrap in a fresh `MediaStream` and
 * feed to `AudioContext.createMediaStreamSource`.
 *
 * The combined level is `max(mic, agent)`, so the orb pulses whether the
 * operator or the agent is talking. A small idle floor keeps the orb breathing
 * when the room is silent (the consumer adds its own baseline too).
 *
 * Usage:
 *   const level = useAudioLevel(room); // room from useMaybeRoomContext()
 *   // level is rAF-smoothed; read it inside your own render loop.
 */

import { useEffect, useRef, useState } from "react";
import { RoomEvent, Track, type Room } from "livekit-client";

/** A single analysed source (one MediaStreamTrack). */
interface Source {
  ctxTrack: MediaStreamTrack;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  data: Uint8Array<ArrayBuffer>;
}

/**
 * Subscribe to the room's audio level. Returns a smoothed 0..1 number that
 * updates roughly every animation frame while audio is flowing.
 */
export function useAudioLevel(room: Room | null | undefined): number {
  const [level, setLevel] = useState(0);

  // Mutable refs so the rAF loop can read the freshest values without
  // re-subscribing on every render.
  const levelRef = useRef(0);
  const emittedRef = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<Map<MediaStreamTrack, Source>>(new Map());

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!room) return;

    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    let disposed = false;
    let raf = 0;

    const ensureCtx = (): AudioContext => {
      if (!ctxRef.current) ctxRef.current = new AudioCtx();
      // The autoplay gate may have suspended us; <StartAudio> clears the gate
      // for playback, but our own context can still need a nudge.
      if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
      return ctxRef.current;
    };

    const attach = (mst: MediaStreamTrack | undefined | null) => {
      if (!mst || mst.kind !== "audio") return;
      const sources = sourcesRef.current;
      if (sources.has(mst)) return;
      try {
        const ctx = ensureCtx();
        const stream = new MediaStream([mst]);
        const node = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.6;
        node.connect(analyser);
        sources.set(mst, {
          ctxTrack: mst,
          source: node,
          analyser,
          data: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
        });
      } catch {
        // A track may be temporarily unavailable; it'll re-fire on the next
        // (un)published/subscribed event.
      }
    };

    const detach = (mst: MediaStreamTrack | undefined | null) => {
      if (!mst) return;
      const sources = sourcesRef.current;
      const entry = sources.get(mst);
      if (!entry) return;
      try {
        entry.source.disconnect();
        entry.analyser.disconnect();
      } catch {
        /* node already torn down */
      }
      sources.delete(mst);
    };

    // Wire up every audio track the room currently exposes: the local mic plus
    // each remote participant's audio publications.
    const syncTracks = () => {
      const seen = new Set<MediaStreamTrack>();

      const consider = (track: Track | undefined) => {
        const mst = track?.mediaStreamTrack;
        if (mst && mst.kind === "audio") {
          seen.add(mst);
          attach(mst);
        }
      };

      // Local mic.
      room.localParticipant.audioTrackPublications.forEach((pub) => consider(pub.track));
      // Remote (agent) audio.
      room.remoteParticipants.forEach((p) => {
        p.audioTrackPublications.forEach((pub) => consider(pub.track));
      });

      // Drop analysers whose track is gone.
      for (const mst of Array.from(sourcesRef.current.keys())) {
        if (!seen.has(mst)) detach(mst);
      }
    };

    syncTracks();

    const onChange = () => {
      if (disposed) return;
      syncTracks();
    };

    room.on(RoomEvent.TrackSubscribed, onChange);
    room.on(RoomEvent.TrackUnsubscribed, onChange);
    room.on(RoomEvent.LocalTrackPublished, onChange);
    room.on(RoomEvent.LocalTrackUnpublished, onChange);
    room.on(RoomEvent.TrackMuted, onChange);
    room.on(RoomEvent.TrackUnmuted, onChange);
    room.on(RoomEvent.ParticipantConnected, onChange);
    room.on(RoomEvent.ParticipantDisconnected, onChange);

    // rAF loop: compute time-domain RMS per source, take the loudest, smooth it.
    const tick = () => {
      let target = 0;
      sourcesRef.current.forEach((s) => {
        // Time-domain RMS is a stable "loudness" proxy across mic + TTS.
        s.analyser.getByteTimeDomainData(s.data);
        let sum = 0;
        for (let i = 0; i < s.data.length; i++) {
          const v = (s.data[i]! - 128) / 128; // -1..1
          sum += v * v;
        }
        const rms = Math.sqrt(sum / s.data.length); // 0..~1
        // Scale: speech RMS is typically ~0.05..0.3 - map to a lively 0..1.
        const scaled = Math.min(1, rms * 3.2);
        if (scaled > target) target = scaled;
      });

      // Exponential smoothing toward the loudest current source.
      levelRef.current += (target - levelRef.current) * 0.2;
      // Only push to React when the change is visible (avoids render spam).
      if (Math.abs(levelRef.current - emittedRef.current) > 0.01) {
        emittedRef.current = levelRef.current;
        setLevel(levelRef.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const activeSources = sourcesRef.current;

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      room.off(RoomEvent.TrackSubscribed, onChange);
      room.off(RoomEvent.TrackUnsubscribed, onChange);
      room.off(RoomEvent.LocalTrackPublished, onChange);
      room.off(RoomEvent.LocalTrackUnpublished, onChange);
      room.off(RoomEvent.TrackMuted, onChange);
      room.off(RoomEvent.TrackUnmuted, onChange);
      room.off(RoomEvent.ParticipantConnected, onChange);
      room.off(RoomEvent.ParticipantDisconnected, onChange);
      activeSources.forEach((s) => {
        try {
          s.source.disconnect();
          s.analyser.disconnect();
        } catch {
          /* already torn down */
        }
      });
      activeSources.clear();
      if (ctxRef.current) {
        void ctxRef.current.close();
        ctxRef.current = null;
      }
      levelRef.current = 0;
      emittedRef.current = 0;
    };
  }, [room]);

  return level;
}
