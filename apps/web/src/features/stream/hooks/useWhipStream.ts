'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type WhipState = 'idle' | 'connecting' | 'connected' | 'failed';

export interface WhipStreamResult {
  state: WhipState;
  connect: (whipUrl: string, stream: MediaStream) => Promise<void>;
  disconnect: () => void;
}

export function useWhipStream(): WhipStreamResult {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [state, setState] = useState<WhipState>('idle');

  const disconnect = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setState('idle');
  }, []);

  const connect = useCallback(async (whipUrl: string, stream: MediaStream) => {
    disconnect();
    setState('connecting');

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcRef.current = pc;

      for (const track of stream.getTracks()) {
        const transceiver = pc.addTransceiver(track, { streams: [stream] });
        if (track.kind === 'video') {
          // MediaMTX can only remux H.264 to HLS — VP8/VP9 would produce a 404 HLS response.
          const caps = RTCRtpSender.getCapabilities('video');
          if (caps) {
            const h264 = caps.codecs.filter((c) => c.mimeType.toLowerCase() === 'video/h264');
            if (h264.length > 0) transceiver.setCodecPreferences(h264);
          }
        }
      }

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setState('connected');
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setState('failed');
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete so all candidates are in the SDP.
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') { resolve(); return; }
        pc.addEventListener('icegatheringstatechange', function handler() {
          if (pc.iceGatheringState === 'complete') {
            pc.removeEventListener('icegatheringstatechange', handler);
            resolve();
          }
        });
        // Fallback timeout — some networks are slow with ICE gathering.
        setTimeout(resolve, 4000);
      });

      const sdpOffer = pc.localDescription?.sdp ?? '';
      const res = await fetch(whipUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: sdpOffer,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`WHIP ${res.status}: ${text}`);
      }

      const answerSdp = await res.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (err) {
      disconnect();
      setState('failed');
      throw err;
    }
  }, [disconnect]);

  useEffect(() => {
    return () => { disconnect(); };
  }, [disconnect]);

  return { state, connect, disconnect };
}
