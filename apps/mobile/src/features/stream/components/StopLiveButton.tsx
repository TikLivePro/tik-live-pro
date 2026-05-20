import React from 'react';
import { ActivityIndicator, TouchableOpacity } from 'react-native';
import styled from 'styled-components/native';
import type { LiveSessionId } from '@tik-live-pro/shared-types';
import { useStreamStore } from '@/store/stream.store';
import { useAuthStore } from '@/store/auth.store';

const API_BASE = process.env['API_URL'] ?? 'http://localhost:3000';

const Button = styled(TouchableOpacity)<{ disabled?: boolean }>`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  padding-vertical: 14px;
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
`;

const StopIcon = styled.View`
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border-width: 2px;
  border-color: white;
`;

const ButtonText = styled.Text`
  font-size: 15px;
  font-weight: 600;
  color: white;
`;

interface Props {
  sessionId: LiveSessionId;
}

export function StopLiveButton({ sessionId }: Props): React.ReactElement {
  const { isEnding, setEnding, updateSessionStatus } = useStreamStore();
  const { accessToken } = useAuthStore();

  async function handleStop(): Promise<void> {
    if (isEnding) return;
    setEnding(true);
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/end`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken ?? ''}` },
      });
      if (res.ok) updateSessionStatus('ending');
    } finally {
      setEnding(false);
    }
  }

  return (
    <Button onPress={() => void handleStop()} disabled={isEnding}>
      {isEnding ? (
        <ActivityIndicator color="white" size="small" />
      ) : (
        <>
          <StopIcon />
          <ButtonText>Arrêter le live</ButtonText>
        </>
      )}
    </Button>
  );
}
