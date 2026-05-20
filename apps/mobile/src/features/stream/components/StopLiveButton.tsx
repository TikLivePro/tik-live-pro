import React from 'react';
import { ActivityIndicator } from 'react-native';
import styled from 'styled-components/native';
import type { LiveSessionId } from '@tik-live-pro/shared-types';
import { useStopSession } from '../hooks/useStopSession';

const Button = styled.TouchableOpacity<{ disabled?: boolean }>`
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
  const { isEnding, stopSession } = useStopSession();

  return (
    <Button onPress={() => void stopSession(sessionId)} disabled={isEnding}>
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
