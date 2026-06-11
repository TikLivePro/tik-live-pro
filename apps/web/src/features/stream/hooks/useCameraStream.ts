'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStreamStore } from '../store/stream.store';
import { getVideoQualityPreset } from '../consts/stream.consts';

export type CameraState = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'error';

export interface CameraStreamResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  state: CameraState;
  isMicMuted: boolean;
  isCameraOff: boolean;
  micVolume: number;
  speakerVolume: number;
  start: () => Promise<void>;
  stop: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  setMicVolume: (v: number) => void;
  setSpeakerVolume: (v: number) => void;
  getStream: () => MediaStream | null;
}

async function buildAudioChain(
  stream: MediaStream,
  micVolume: number,
  speakerVolume: number,
): Promise<{
  ctx: AudioContext;
  micGain: GainNode;
  monitorGain: GainNode;
} | null> {
  if (stream.getAudioTracks().length === 0) {
    return null;
  }
  try {
    const ctx = new AudioContext();
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const micGain = ctx.createGain();
    micGain.gain.value = micVolume / 100;
    const monitorGain = ctx.createGain();
    monitorGain.gain.value = speakerVolume / 100;
    source.connect(micGain);
    micGain.connect(monitorGain);
    monitorGain.connect(ctx.destination);
    return { ctx, micGain, monitorGain };
  } catch {
    return null;
  }
}

export function useCameraStream(autoStart = false): CameraStreamResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const acquiringRef = useRef(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);

  const micVolumeRef = useRef(80);
  const speakerVolumeRef = useRef(0);

  const [state, setState] = useState<CameraState>('idle');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [micVolume, setMicVolumeState] = useState(80);
  const [speakerVolume, setSpeakerVolumeState] = useState(0);

  const start = useCallback(async () => {
    if (acquiringRef.current || streamRef.current) return;

    // Reuse the stream preserved across minimized navigation
    const existingStream = useStreamStore.getState().activeStream;
    if (existingStream?.active) {
      streamRef.current = existingStream;
      if (videoRef.current) videoRef.current.srcObject = existingStream;
      const chain = await buildAudioChain(
        existingStream,
        micVolumeRef.current,
        speakerVolumeRef.current,
      );
      if (chain) {
        audioCtxRef.current = chain.ctx;
        micGainRef.current = chain.micGain;
        monitorGainRef.current = chain.monitorGain;
      }
      setState('active');
      return;
    }

    acquiringRef.current = true;
    setState('requesting');
    try {
      const qualityId = useStreamStore.getState().videoQualityId;
      const preset = getVideoQualityPreset(qualityId);

      const videoConstraints = {
        width: { ideal: preset.width },
        height: { ideal: preset.height },
        frameRate: { ideal: 30 },
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: true,
        });
      } catch (firstErr) {
        console.warn('Failed to start camera with audio, retrying video-only:', firstErr);
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          });
          setIsMicMuted(true);
        } catch (secondErr) {
          console.warn('Failed to start camera with ideal constraints, retrying with basic constraints:', secondErr);
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
          setIsMicMuted(true);
        }
      }

      streamRef.current = stream;
      useStreamStore.getState().setActiveStream(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;

      const chain = await buildAudioChain(stream, micVolumeRef.current, speakerVolumeRef.current);
      if (chain) {
        audioCtxRef.current = chain.ctx;
        micGainRef.current = chain.micGain;
        monitorGainRef.current = chain.monitorGain;
      }

      setState('active');
    } catch (err) {
      const name = err instanceof Error || (err && typeof err === 'object' && 'name' in err)
        ? (err as { name: string }).name
        : '';
      if (name === 'NotAllowedError') {
        setState('denied');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setState('unavailable');
      } else {
        setState('error');
      }
    } finally {
      acquiringRef.current = false;
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    micGainRef.current = null;
    monitorGainRef.current = null;
    useStreamStore.getState().setActiveStream(null);
    useStreamStore.getState().setMinimized(false);
    setState('idle');
    setIsMicMuted(false);
    setIsCameraOff(false);
  }, []);

  const toggleMic = useCallback(() => {
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsMicMuted((prev) => !prev);
  }, []);

  const toggleCamera = useCallback(() => {
    streamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsCameraOff((prev) => !prev);
  }, []);

  const setMicVolume = useCallback((v: number) => {
    micVolumeRef.current = v;
    setMicVolumeState(v);
    if (micGainRef.current) micGainRef.current.gain.value = v / 100;
  }, []);

  const setSpeakerVolume = useCallback((v: number) => {
    speakerVolumeRef.current = v;
    setSpeakerVolumeState(v);
    if (monitorGainRef.current) monitorGainRef.current.gain.value = v / 100;
  }, []);

  const getStream = useCallback(() => streamRef.current, []);

  useEffect(() => {
    if (autoStart) void start();
    return () => {
      // If the user minimized, keep the stream alive for the layout mini player
      if (!useStreamStore.getState().isMinimized) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        useStreamStore.getState().setActiveStream(null);
      }
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      micGainRef.current = null;
      monitorGainRef.current = null;
    };
    // start is stable; autoStart is a mount-time value — intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    videoRef,
    state,
    isMicMuted,
    isCameraOff,
    micVolume,
    speakerVolume,
    start,
    stop,
    toggleMic,
    toggleCamera,
    setMicVolume,
    setSpeakerVolume,
    getStream,
  };
}
