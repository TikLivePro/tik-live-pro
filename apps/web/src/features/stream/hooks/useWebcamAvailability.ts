'use client';

import { useEffect, useState } from 'react';

interface WebcamAvailability {
  hasWebcam: boolean;
  checked: boolean;
}

export function useWebcamAvailability(): WebcamAvailability {
  // Start optimistically enabled so the button is never disabled before we check.
  const [state, setState] = useState<WebcamAvailability>({ hasWebcam: true, checked: false });

  useEffect(() => {
    // No media device API at all (non-secure context, very old browser).
    if (!navigator.mediaDevices?.enumerateDevices) {
      setState({ hasWebcam: false, checked: true });
      return;
    }

    async function check(): Promise<void> {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (devices.some((d) => d.kind === 'videoinput')) {
          // Camera confirmed present and visible.
          setState({ hasWebcam: true, checked: true });
          return;
        }

        // No videoinput in the enumeration. This is ambiguous:
        //   • Chrome with site camera permission denied → hides video entries.
        //   • Firefox before any permission is granted → hides all inputs.
        //   • Genuinely no camera hardware.
        //
        // Probe getUserMedia only when we know it won't show a permission dialog.
        // If the Permissions API says 'prompt', skip the probe and leave enabled so
        // the user can click the camera tab and trigger the dialog themselves.
        let permState: PermissionState | null = null;
        try {
          const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
          permState = result.state;
        } catch {
          // Permissions API unavailable (some browsers / private mode).
        }

        if (permState === 'prompt' || permState === null) {
          // Can't determine without prompting — keep the button enabled.
          setState({ hasWebcam: true, checked: true });
          return;
        }

        // permState is 'granted' or 'denied': calling getUserMedia won't show a dialog.
        // It rejects immediately. The error name tells us whether hardware exists.
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          stream.getTracks().forEach((t) => t.stop());
          setState({ hasWebcam: true, checked: true });
        } catch (err) {
          const name = err instanceof Error ? err.name : '';
          // NotFoundError / DevicesNotFoundError = no camera hardware.
          // NotAllowedError / NotReadableError / etc. = camera exists but can't access it.
          const noHardware = name === 'NotFoundError' || name === 'DevicesNotFoundError';
          setState({ hasWebcam: !noHardware, checked: true });
        }
      } catch {
        // enumerateDevices itself failed — we can't tell; keep the button enabled.
        setState({ hasWebcam: true, checked: true });
      }
    }

    void check();

    const handler = (): void => void check();
    navigator.mediaDevices.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
  }, []);

  return state;
}
