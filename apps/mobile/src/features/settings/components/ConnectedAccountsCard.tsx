import React from 'react';
import { Alert } from 'react-native';
import styled from 'styled-components/native';
import { useTikTokAccounts, useRemoveAccount } from '../hooks/useConnectedAccounts';
import { AVATAR_COLORS } from '../consts/settings.consts';
import { getInitials } from '@/lib/text.utils';

const Card = styled.View`
  background-color: #1e2233;
  border-radius: 16px;
  padding: 16px;
`;

const AccountsHeader = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const SectionLabel = styled.Text`
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  letter-spacing: 1.5px;
`;

const AddButton = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding-horizontal: 10px;
  padding-vertical: 6px;
`;

const AddButtonText = styled.Text`
  font-size: 13px;
  font-weight: 500;
  color: white;
`;

const Divider = styled.View`
  height: 1px;
  background-color: rgba(255, 255, 255, 0.06);
`;

const AccountRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding-vertical: 8px;
`;

const Avatar = styled.View<{ color: string }>`
  width: 38px;
  height: 38px;
  border-radius: 19px;
  background-color: ${({ color }) => color};
  align-items: center;
  justify-content: center;
`;

const AvatarText = styled.Text`
  font-size: 13px;
  font-weight: 700;
  color: white;
`;

const AccountName = styled.Text`
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: white;
`;

const DeleteButton = styled.TouchableOpacity`
  padding: 6px;
`;

const TrashIconText = styled.Text`
  font-size: 16px;
  color: #ef4444;
`;

const EmptyText = styled.Text`
  font-size: 14px;
  color: #64748b;
  text-align: center;
  padding-vertical: 12px;
`;

const SkeletonRow = styled.View`
  height: 20px;
  background-color: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  margin-bottom: 8px;
`;

export function ConnectedAccountsCard() {
  const { data: tiktokAccounts, isLoading } = useTikTokAccounts();
  const { mutate: removeAccount } = useRemoveAccount();

  const confirmRemove = (accountId: string, displayName: string) => {
    Alert.alert('Retirer le compte', `Retirer ${displayName} ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: () => removeAccount(accountId) },
    ]);
  };

  return (
    <Card>
      <AccountsHeader>
        <SectionLabel>COMPTES TIKTOK CONNECTÉS</SectionLabel>
        <AddButton onPress={() => { /* connect TikTok */ }}>
          <AddButtonText>+ Ajouter</AddButtonText>
        </AddButton>
      </AccountsHeader>

      {isLoading ? (
        <>
          <SkeletonRow />
          <SkeletonRow style={{ marginBottom: 0 }} />
        </>
      ) : tiktokAccounts && tiktokAccounts.length > 0 ? (
        tiktokAccounts.map((account, i) => (
          <React.Fragment key={account.id}>
            {i > 0 && <Divider />}
            <AccountRow>
              <Avatar color={AVATAR_COLORS[i % AVATAR_COLORS.length] ?? '#475569'}>
                <AvatarText>{getInitials(account.displayName)}</AvatarText>
              </Avatar>
              <AccountName>{account.displayName}</AccountName>
              <DeleteButton onPress={() => confirmRemove(account.id, account.displayName)}>
                <TrashIconText>🗑</TrashIconText>
              </DeleteButton>
            </AccountRow>
          </React.Fragment>
        ))
      ) : (
        <EmptyText>Aucun compte TikTok connecté</EmptyText>
      )}
    </Card>
  );
}
