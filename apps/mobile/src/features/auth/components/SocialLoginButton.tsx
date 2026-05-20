import React from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
import styled from 'styled-components/native';
import type { AppTheme } from '@/theme/theme';
import type { OAuthProvider } from '../interfaces/auth.interfaces';

const PROVIDER_CONFIG: Record<OAuthProvider, { label: string; color: string; letter: string }> = {
  google: { label: 'Continue with Google', color: '#4285F4', letter: 'G' },
  facebook: { label: 'Continue with Facebook', color: '#1877F2', letter: 'f' },
  tiktok: { label: 'Continue with TikTok', color: '#010101', letter: 'T' },
};

const Button = styled.TouchableOpacity<{ theme: AppTheme; disabled?: boolean }>`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-vertical: ${({ theme }) => theme.spacing.md}px;
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
`;

const ButtonText = styled.Text<{ theme: AppTheme }>`
  color: ${({ theme }) => theme.colors.foreground};
  font-size: 15px;
  font-weight: 600;
`;

interface Props {
  provider: OAuthProvider;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function SocialLoginButton({ provider, onPress, loading, disabled }: Props) {
  const config = PROVIDER_CONFIG[provider];

  return (
    <Button disabled={disabled} onPress={onPress} activeOpacity={0.7}>
      {loading ? (
        <ActivityIndicator color={config.color} size="small" />
      ) : (
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: provider === 'tiktok' ? 4 : 10,
            backgroundColor: config.color,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: 'white', fontWeight: '700', fontSize: 12 }}>{config.letter}</Text>
        </View>
      )}
      <ButtonText>{config.label}</ButtonText>
    </Button>
  );
}
