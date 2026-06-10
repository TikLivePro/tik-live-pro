'use client';

import { useEffect, useState } from 'react';

interface WebcamAvailability {
  hasWebcam: boolean;
  checked: boolean;
}

export function useWebcamAvailability(): WebcamAvailability {
  const [state, setState] = useState<WebcamAvailability>({ hasWebcam: false, checked: false });

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setState({ hasWebcam: false, checked: true });
      return;
    }

    async function check(): Promise<void> {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setState({ hasWebcam: devices.some((d) => d.kind === 'videoinput'), checked: true });
      } catch {
        setState({ hasWebcam: false, checked: true });
      }
    }

    void check();

    const handler = (): void => void check();
    navigator.mediaDevices.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
  }, []);

  return state;
}
