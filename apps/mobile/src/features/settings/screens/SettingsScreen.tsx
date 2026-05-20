import React from 'react';
import styled from 'styled-components/native';
import type { AppScreenProps } from '@/navigation/types';
import { SubscriptionCard } from '../components/SubscriptionCard';
import { SecurityCard } from '../components/SecurityCard';
import { ConnectedAccountsCard } from '../components/ConnectedAccountsCard';

const Screen = styled.SafeAreaView`
  flex: 1;
  background-color: #0f1117;
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  padding-horizontal: 16px;
  padding-vertical: 12px;
  border-bottom-width: 1px;
  border-bottom-color: rgba(255, 255, 255, 0.06);
`;

const BackButton = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  padding-right: 12px;
`;

const BackArrowText = styled.Text`
  font-size: 18px;
  color: #94a3b8;
  line-height: 22px;
`;

const BackText = styled.Text`
  font-size: 15px;
  color: #94a3b8;
`;

const HeaderTitle = styled.Text`
  font-size: 17px;
  font-weight: 700;
  color: white;
`;

const Content = styled.ScrollView`
  flex: 1;
`;

const Inner = styled.View`
  padding: 16px;
  gap: 12px;
`;

export function SettingsScreen({ navigation }: AppScreenProps<'Settings'>): React.ReactElement {
  return (
    <Screen>
      <Header>
        <BackButton onPress={() => navigation.goBack()}>
          <BackArrowText>‹</BackArrowText>
          <BackText>Retour</BackText>
        </BackButton>
        <HeaderTitle>Paramètres</HeaderTitle>
      </Header>

      <Content showsVerticalScrollIndicator={false}>
        <Inner>
          <SubscriptionCard />
          <SecurityCard />
          <ConnectedAccountsCard />
        </Inner>
      </Content>
    </Screen>
  );
}
