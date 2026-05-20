import React from 'react';
import styled from 'styled-components/native';

const Card = styled.View`
  background-color: #1e2233;
  border-radius: 16px;
  padding: 16px;
`;

const SectionLabel = styled.Text`
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  letter-spacing: 1.5px;
  margin-bottom: 12px;
`;

const SecurityRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const SecurityInfo = styled.View`
  gap: 2px;
`;

const SecurityLabel = styled.Text`
  font-size: 14px;
  font-weight: 500;
  color: white;
`;

const SecuritySub = styled.Text`
  font-size: 12px;
  color: #64748b;
`;

const EditButton = styled.TouchableOpacity`
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding-horizontal: 14px;
  padding-vertical: 7px;
`;

const EditButtonText = styled.Text`
  font-size: 13px;
  font-weight: 500;
  color: white;
`;

export function SecurityCard() {
  return (
    <Card>
      <SectionLabel>SÉCURITÉ</SectionLabel>
      <SecurityRow>
        <SecurityInfo>
          <SecurityLabel>Mot de passe</SecurityLabel>
          <SecuritySub>Modifié il y a 30 jours</SecuritySub>
        </SecurityInfo>
        <EditButton onPress={() => { /* navigate to change password */ }}>
          <EditButtonText>Modifier</EditButtonText>
        </EditButton>
      </SecurityRow>
    </Card>
  );
}
