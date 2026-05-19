import React from 'react';
import styled from 'styled-components/native';
import { ActivityIndicator } from 'react-native';
import type { AppTheme } from '@/theme/theme';
import { useStreamStore } from '@/store/stream.store';

const Container = styled.View<{ theme: AppTheme }>`
  padding: ${({ theme }) => theme.spacing.md}px;
  border-top-width: 1px;
  border-top-color: ${({ theme }) => theme.colors.border};
`;

const GoLiveButton = styled.TouchableOpacity<{ theme: AppTheme; disabled?: boolean }>`
  background-color: ${({ theme, disabled }) => (disabled ? theme.colors.muted : theme.colors.brand)};
  border-radius: ${({ theme }) => theme.radius.lg}px;
  padding-vertical: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
  justify-content: center;
`;

const EndButton = styled(GoLiveButton)<{ theme: AppTheme }>`
  background-color: ${({ theme }) => theme.colors.destructive};
`;

const ButtonText = styled.Text`
  color: white;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.5px;
`;

export function StreamControls() {
  const { currentSession, isStarting, isEnding } = useStreamStore();
  const isLive = currentSession?.status === 'live';

  return (
    <Container>
      {!isLive ? (
        <GoLiveButton disabled={isStarting}>
          {isStarting ? (
            <ActivityIndicator color="white" />
          ) : (
            <ButtonText>GO LIVE</ButtonText>
          )}
        </GoLiveButton>
      ) : (
        <EndButton disabled={isEnding}>
          {isEnding ? (
            <ActivityIndicator color="white" />
          ) : (
            <ButtonText>END STREAM</ButtonText>
          )}
        </EndButton>
      )}
    </Container>
  );
}
