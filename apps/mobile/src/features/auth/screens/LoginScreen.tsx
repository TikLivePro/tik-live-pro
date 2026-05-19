import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import styled from 'styled-components/native';
import type { AppTheme } from '@/theme/theme';
import type { AuthScreenProps } from '@/navigation/types';

const Screen = styled.SafeAreaView<{ theme: AppTheme }>`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const Inner = styled.View<{ theme: AppTheme }>`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.xl}px ${({ theme }) => theme.spacing.lg}px;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.md}px;
`;

const Logo = styled.Text<{ theme: AppTheme }>`
  font-size: ${({ theme }) => theme.typography['2xl'].fontSize}px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.brand};
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const Input = styled.TextInput<{ theme: AppTheme }>`
  background-color: ${({ theme }) => theme.colors.surface};
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  font-size: ${({ theme }) => theme.typography.base.fontSize}px;
  color: ${({ theme }) => theme.colors.foreground};
`;

const SubmitButton = styled.TouchableOpacity<{ theme: AppTheme; disabled?: boolean }>`
  background-color: ${({ theme, disabled }) =>
    disabled ? theme.colors.muted : theme.colors.brand};
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-vertical: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
`;

const ButtonText = styled.Text`
  color: white;
  font-size: 16px;
  font-weight: 700;
`;

export function LoginScreen(_props: AuthScreenProps<'Login'>) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length >= 6 && !loading;

  const handleLogin = async () => {
    if (!canSubmit) return;
    setLoading(true);
    // TODO: call auth service via React Query mutation
    setLoading(false);
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <Inner>
          <Logo>TikLivePro</Logo>
          <Input
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
            autoComplete="email"
          />
          <Input
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            autoComplete="current-password"
          />
          <SubmitButton disabled={!canSubmit} onPress={handleLogin}>
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <ButtonText>Sign In</ButtonText>
            )}
          </SubmitButton>
        </Inner>
      </KeyboardAvoidingView>
    </Screen>
  );
}
