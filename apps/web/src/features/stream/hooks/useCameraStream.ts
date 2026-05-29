'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraState = 'idle' | 'requesting' | 'active' | 'denied' | 'error';

export interface CameraStreamResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  state: CameraState;
  isMicMuted: boolean;
  isCameraOff: boolean;
  start: () => Promise<void>;
  stop: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
}

export function useCameraStream(autoStart = false): CameraStreamResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const acquiringRef = useRef(false);
  const [state, setState] = useState<CameraState>('idle');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  const start = useCallback(async () => {
    if (acquiringRef.current || streamRef.current) return;
    acquiringRef.current = true;
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setState('active');
    } catch (err) {
      setState(err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : 'error');
    } finally {
      acquiringRef.current = false;
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
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

  useEffect(() => {
    if (autoStart) void start();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // start is stable (no deps), autoStart is a mount-time value — intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { videoRef, state, isMicMuted, isCameraOff, start, stop, toggleMic, toggleCamera };
}
