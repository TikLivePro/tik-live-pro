import React from 'react';
import styled from 'styled-components/native';
import { useAuthStore } from '@/store/auth.store';
import { useSubscription } from '../hooks/useSubscription';
import { PREMIUM_PRICE } from '../consts/settings.consts';

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

const Divider = styled.View`
  height: 1px;
  background-color: rgba(255, 255, 255, 0.06);
`;

const Row = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-vertical: 10px;
`;

const RowLabel = styled.Text`
  font-size: 14px;
  color: #94a3b8;
`;

const RowValue = styled.Text`
  font-size: 14px;
  font-weight: 500;
  color: white;
`;

const ActiveBadge = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
`;

const ActiveDot = styled.View`
  width: 7px;
  height: 7px;
  border-radius: 4px;
  background-color: #4ade80;
`;

const ActiveText = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #4ade80;
`;

const SkeletonRow = styled.View`
  height: 20px;
  background-color: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  margin-bottom: 8px;
`;

export function SubscriptionCard() {
  const { subscriptionTier } = useAuthStore();
  const { data: subscription, isLoading } = useSubscription();

  const isActive = subscription?.status === 'active' || subscription?.status === 'trialing';
  const renewalDate = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—';
  const monthlyRate = subscriptionTier === 'premium' ? `${PREMIUM_PRICE} $/mois` : '0 $/mois';

  return (
    <Card>
      <SectionLabel>ABONNEMENT</SectionLabel>
      {isLoading ? (
        <>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow style={{ marginBottom: 0 }} />
        </>
      ) : (
        <>
          <Row>
            <RowLabel>Statut</RowLabel>
            {isActive ? (
              <ActiveBadge>
                <ActiveDot />
                <ActiveText>Actif</ActiveText>
              </ActiveBadge>
            ) : (
              <RowValue>Inactif</RowValue>
            )}
          </Row>
          <Divider />
          <Row>
            <RowLabel>Prochain renouvellement</RowLabel>
            <RowValue>{renewalDate}</RowValue>
          </Row>
          <Divider />
          <Row style={{ paddingBottom: 0 }}>
            <RowLabel>Tarif mensuel</RowLabel>
            <RowValue>{monthlyRate}</RowValue>
          </Row>
        </>
      )}
    </Card>
  );
}
