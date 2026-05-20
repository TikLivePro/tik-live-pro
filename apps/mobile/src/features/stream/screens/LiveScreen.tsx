import React from 'react';
import styled from 'styled-components/native';
import { useStreamStore } from '@/store/stream.store';
import { useElapsedTime } from '../hooks/useElapsedTime';
import { AccountStatusList } from '../components/AccountStatusList';
import { StopLiveButton } from '../components/StopLiveButton';
import type { AppScreenProps } from '@/navigation/types';

const Screen = styled.SafeAreaView`
  flex: 1;
  background-color: #0f1117;
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-horizontal: 16px;
  padding-vertical: 12px;
  border-bottom-width: 1px;
  border-bottom-color: rgba(255, 255, 255, 0.05);
`;

const BrandRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
`;

const BrandIcon = styled.View`
  width: 28px;
  height: 28px;
  border-radius: 14px;
  background-color: #e53935;
  align-items: center;
  justify-content: center;
`;

const BrandDot = styled.View`
  width: 10px;
  height: 10px;
  border-radius: 5px;
  border-width: 2px;
  border-color: white;
`;

const BrandText = styled.Text`
  font-size: 17px;
  font-weight: 700;
  color: white;
  letter-spacing: -0.3px;
`;

const LiveBadge = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  background-color: #dc2626;
  border-radius: 999px;
  padding-horizontal: 10px;
  padding-vertical: 5px;
`;

const LiveDot = styled.View`
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background-color: white;
`;

const LiveBadgeText = styled.Text`
  color: white;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3px;
`;

const SettingsButton = styled.TouchableOpacity`
  padding: 6px;
`;

const SettingsIcon = styled.Text`
  font-size: 20px;
  color: #94a3b8;
`;

const Content = styled.ScrollView`
  flex: 1;
`;

const Inner = styled.View`
  padding-horizontal: 16px;
  padding-top: 16px;
  gap: 16px;
`;

const StatsCard = styled.View`
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 16px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const StatBlock = styled.View`
  gap: 4px;
`;

const StatLabel = styled.Text`
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 4px;
`;

const StatValue = styled.Text`
  font-size: 30px;
  font-weight: 700;
  color: white;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5px;
`;

const LiveCountValue = styled(StatValue)`
  color: #4ade80;
`;

const Footer = styled.View`
  padding-horizontal: 16px;
  padding-bottom: 16px;
  padding-top: 8px;
`;

export function LiveScreen({ navigation }: AppScreenProps<'Live'>): React.ReactElement {
  const { currentSession } = useStreamStore();
  const isLive = currentSession?.status === 'live';
  const elapsed = useElapsedTime(isLive ? (currentSession?.startedAt ?? null) : null);
  const destinations = currentSession?.destinations ?? [];
  const liveCount = destinations.filter((d) => d.status === 'live').length;

  return (
    <Screen>
      <Header>
        <BrandRow>
          <BrandIcon>
            <BrandDot />
          </BrandIcon>
          <BrandText>TikLive Pro</BrandText>
        </BrandRow>
        {isLive ? (
          <LiveBadge>
            <LiveDot />
            <LiveBadgeText>En direct</LiveBadgeText>
          </LiveBadge>
        ) : (
          <SettingsButton onPress={() => navigation.navigate('Settings')}>
            <SettingsIcon>⚙</SettingsIcon>
          </SettingsButton>
        )}
      </Header>

      <Content showsVerticalScrollIndicator={false}>
        <Inner>
          <StatsCard>
            <StatBlock>
              <StatLabel>Durée du live</StatLabel>
              <StatValue>{elapsed}</StatValue>
            </StatBlock>
            <StatBlock style={{ alignItems: 'flex-end' }}>
              <StatLabel>Comptes en direct</StatLabel>
              <LiveCountValue>{liveCount} / {destinations.length}</LiveCountValue>
            </StatBlock>
          </StatsCard>

          <AccountStatusList destinations={destinations} />
        </Inner>
      </Content>

      {isLive && currentSession && (
        <Footer>
          <StopLiveButton sessionId={currentSession.id} />
        </Footer>
      )}
    </Screen>
  );
}
