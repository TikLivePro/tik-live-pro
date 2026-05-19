import React from 'react';
import styled from 'styled-components/native';
import type { AppTheme } from '@/theme/theme';
import { CommentList } from '../components/CommentList';
import { StreamControls } from '../components/StreamControls';
import { DestinationStatus } from '../components/DestinationStatus';
import { useStreamStore } from '@/store/stream.store';

const Screen = styled.SafeAreaView<{ theme: AppTheme }>`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const Header = styled.View<{ theme: AppTheme }>`
  padding: ${({ theme }) => theme.spacing.md}px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const Title = styled.Text<{ theme: AppTheme }>`
  font-size: ${({ theme }) => theme.typography.lg.fontSize}px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.foreground};
`;

const LiveBadge = styled.View<{ theme: AppTheme }>`
  background-color: ${({ theme }) => theme.colors.live};
  border-radius: ${({ theme }) => theme.radius.full}px;
  padding-horizontal: ${({ theme }) => theme.spacing.sm}px;
  padding-vertical: ${({ theme }) => theme.spacing.xs}px;
  flex-direction: row;
  align-items: center;
  gap: 4px;
`;

const LiveBadgeText = styled.Text`
  color: white;
  font-size: 12px;
  font-weight: 700;
`;

const Content = styled.View`
  flex: 1;
`;

export function LiveScreen() {
  const { currentSession } = useStreamStore();
  const isLive = currentSession?.status === 'live';

  return (
    <Screen>
      <Header>
        <Title numberOfLines={1}>{currentSession?.title ?? 'Stream'}</Title>
        {isLive && (
          <LiveBadge>
            <LiveBadgeText>● LIVE</LiveBadgeText>
          </LiveBadge>
        )}
      </Header>

      <Content>
        <DestinationStatus destinations={currentSession?.destinations ?? []} />
        <CommentList />
      </Content>

      <StreamControls />
    </Screen>
  );
}
