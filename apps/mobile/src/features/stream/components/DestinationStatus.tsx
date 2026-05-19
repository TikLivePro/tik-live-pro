import React from 'react';
import { ScrollView } from 'react-native';
import styled from 'styled-components/native';
import type { AppTheme } from '@/theme/theme';
import type { PlatformStreamDestination } from '@tik-live-pro/shared-types';

const Container = styled.View<{ theme: AppTheme }>`
  padding: ${({ theme }) => theme.spacing.sm}px ${({ theme }) => theme.spacing.md}px;
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.sm}px;
`;

const Chip = styled.View<{ theme: AppTheme; isLive: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  background-color: ${({ theme, isLive }) =>
    isLive ? 'rgba(34,197,94,0.15)' : theme.colors.mutedBackground};
  border-radius: ${({ theme }) => theme.radius.full}px;
  padding-horizontal: ${({ theme }) => theme.spacing.sm}px;
  padding-vertical: 4px;
`;

const ChipText = styled.Text<{ theme: AppTheme; isLive: boolean }>`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme, isLive }) => (isLive ? '#16a34a' : theme.colors.muted)};
  text-transform: capitalize;
`;

const Dot = styled.View<{ isLive: boolean }>`
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background-color: ${({ isLive }) => (isLive ? '#16a34a' : '#94a3b8')};
`;

interface Props {
  destinations: PlatformStreamDestination[];
}

export function DestinationStatus({ destinations }: Props) {
  if (destinations.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8, flexDirection: 'row' }}>
      {destinations.map((dest) => {
        const isLive = dest.status === 'live';
        return (
          <Chip key={dest.socialAccountId} isLive={isLive}>
            <Dot isLive={isLive} />
            <ChipText isLive={isLive}>{dest.platform}</ChipText>
          </Chip>
        );
      })}
    </ScrollView>
  );
}
