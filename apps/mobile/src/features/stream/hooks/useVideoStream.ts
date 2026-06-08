/**
 * useVideoStream
 *
 * Watches the stream status and, when it transitions to 'live', polls the
 * orchestrator for the WHIP / RTMP ingest URL and triggers the video broadcast.
 *
 * Strategy:
 *  - When currentSession.status === 'live' AND selectedVideoUri is set:
 *    → Fetch the ingest endpoint from the orchestrator
 *    → POST the video URI to the internal "video-push" endpoint so the
 *      backend ffmpeg process picks up the file and broadcasts it to all
 *      RTMP destinations.
 *
 * Note: The actual ffmpeg command runs server-side (see ffmpeg-stream-worker).
 *       This hook only signals the backend "which file to play".
 */

import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useStreamStore } from '@/store/stream.store';
import { useAuthStore } from '@/store/auth.store';
import { API_BASE } from '@/lib/api';

interface IngestResponse {
  ingestUrl: string;
  ingestKey: string;
  hlsUrl: string;
  whipUrl: string;
  status: string;
}

export function useVideoStream(): void {
  const { currentSession, selectedVideoUri } = useStreamStore();
  const { accessToken } = useAuthStore();

  // Prevent duplicate triggers for the same session + file combination
  const triggeredRef = useRef<string | null>(null);

  useEffect(() => {
    const sessionId = currentSession?.id;
    const isLive = currentSession?.status === 'live';

    if (!sessionId || !isLive || !selectedVideoUri || !accessToken) return;

    // Build a stable key: sessionId + file URI
    const triggerKey = `${sessionId}::${selectedVideoUri}`;
    if (triggeredRef.current === triggerKey) return;
    triggeredRef.current = triggerKey;

    async function triggerVideoPlayback() {
      try {
        // POST the HTTP URL of the video to the orchestrator video-push endpoint.
        // The backend fetches the URL via ffmpeg and pushes it into the RTMP pipeline.
        // NOTE: selectedVideoUri MUST be an HTTP/HTTPS URL reachable by the server.
        //       Local device paths cannot work because the server has no access to
        //       the mobile device filesystem.
        const pushRes = await fetch(
          `${API_BASE}/stream-orchestrator/sessions/${sessionId}/video-push`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken ?? ''}`,
            },
            body: JSON.stringify({ videoUri: selectedVideoUri }),
          },
        );

        if (pushRes.ok) {
          console.info('[useVideoStream] Video broadcast triggered successfully');
        } else {
          const body = await pushRes.json().catch(() => ({})) as { message?: string; code?: string };
          const msg = body.message ?? `HTTP ${pushRes.status}`;
          console.warn('[useVideoStream] Video push failed:', pushRes.status, body);

          // Show a user-visible alert so the streamer knows the video is not streaming
          Alert.alert(
            'Erreur de diffusion vidéo',
            pushRes.status === 400
              ? `L\'URL fournie est invalide.\n\n${msg}\n\nAssurez-vous d\'utiliser une URL HTTP/HTTPS accessible par le serveur.`
              : `La diffusion vidéo a échoué (${pushRes.status}).\n${msg}`,
            [{ text: 'OK' }],
          );
        }
      } catch (err) {
        console.error('[useVideoStream] Error triggering video broadcast:', err);
        Alert.alert(
          'Erreur réseau',
          'Impossible de contacter le serveur pour démarrer la diffusion vidéo.',
          [{ text: 'OK' }],
        );
      }
    }

    void triggerVideoPlayback();
  }, [currentSession?.id, currentSession?.status, selectedVideoUri, accessToken]);
}
