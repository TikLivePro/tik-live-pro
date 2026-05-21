import React from 'react';
import styled from 'styled-components/native';
import type { PlatformStreamDestination } from '@tik-live-pro/shared-types';
import { AVATAR_COLORS } from '../consts/stream.consts';
import { getInitials } from '@/lib/text.utils';
import { useSocialAccounts } from '../hooks/useSocialAccounts';

const SectionLabel = styled.Text`
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  letter-spacing: 1.5px;
  margin-bottom: 8px;
`;

const Row = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 12px;
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 12px 16px;
  margin-bottom: 8px;
`;

const StatusDot = styled.View<{ live: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background-color: ${({ live }) => (live ? '#22c55e' : '#475569')};
`;

const Avatar = styled.View<{ color: string }>`
  width: 36px;
  height: 36px;
  border-radius: 18px;
  background-color: ${({ color }) => color};
  align-items: center;
  justify-content: center;
`;

const AvatarText = styled.Text`
  font-size: 13px;
  font-weight: 700;
  color: white;
`;

const Info = styled.View`
  flex: 1;
`;

const DisplayName = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: white;
`;

const SubText = styled.Text`
  font-size: 12px;
  color: #94a3b8;
  margin-top: 1px;
`;

const OkBadge = styled.Text`
  font-size: 12px;
  font-weight: 700;
  color: #4ade80;
`;

interface Props {
  destinations: PlatformStreamDestination[];
}

export function AccountStatusList({ destinations }: Props): React.ReactElement | null {
  const { data: accounts } = useSocialAccounts();

  if (destinations.length === 0) return null;

  return (
    <>
      <SectionLabel>ÉTAT DES COMPTES</SectionLabel>
      {destinations.map((dest, i) => {
        const account = accounts?.find((a) => a.id === dest.socialAccountId);
        const displayName = account?.displayName ?? dest.platform;
        const isLive = dest.status === 'live';
        const color = AVATAR_COLORS[i % AVATAR_COLORS.length] ?? '#475569';

        return (
          <Row key={dest.socialAccountId}>
            <StatusDot live={isLive} />
            <Avatar color={color}>
              <AvatarText>{getInitials(displayName)}</AvatarText>
            </Avatar>
            <Info>
              <DisplayName>{displayName}</DisplayName>
              <SubText>Stream actif</SubText>
            </Info>
            {isLive && <OkBadge>OK</OkBadge>}
          </Row>
        );
      })}
    </>
  );
}
