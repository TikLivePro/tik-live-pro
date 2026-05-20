import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import styled from 'styled-components/native';
import type { AppTheme } from '@/theme/theme';
import type { AuthScreenProps } from '@/navigation/types';
import { useSocialAuth } from '../hooks/useSocialAuth';
import { SocialLoginButton } from '../components/SocialLoginButton';
import type { OAuthProvider } from '../interfaces/auth.interfaces';

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
  background-color: ${({ theme, disabled }) => (disabled ? theme.colors.muted : theme.colors.brand)};
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

const Divider = styled.View<{ theme: AppTheme }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm}px;
  margin-vertical: ${({ theme }) => theme.spacing.sm}px;
`;

const DividerLine = styled.View<{ theme: AppTheme }>`
  flex: 1;
  height: 1px;
  background-color: ${({ theme }) => theme.colors.border};
`;

const DividerText = styled.Text<{ theme: AppTheme }>`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 12px;
`;

const ErrorText = styled.Text`
  color: #ef4444;
  font-size: 13px;
  text-align: center;
`;

const SOCIAL_PROVIDERS: OAuthProvider[] = ['google', 'facebook', 'tiktok'];

export function LoginScreen(_props: AuthScreenProps<'Login'>) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const { loginWithProvider, loading: socialLoading, error: socialError } = useSocialAuth();

  const isLoading = emailLoading || socialLoading;
  const canSubmit = email.trim().length > 0 && password.length >= 6 && !isLoading;

  const handleLogin = async () => {
    if (!canSubmit) return;
    setEmailLoading(true);
    // TODO: call auth service via React Query mutation
    setEmailLoading(false);
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Inner>
          <Logo>TikLivePro</Logo>

          {SOCIAL_PROVIDERS.map((provider) => (
            <SocialLoginButton
              key={provider}
              provider={provider}
              onPress={() => loginWithProvider(provider)}
              loading={socialLoading}
              disabled={isLoading}
            />
          ))}

          {socialError && <ErrorText>{socialError}</ErrorText>}

          <Divider>
            <DividerLine />
            <DividerText>or sign in with email</DividerText>
            <DividerLine />
          </Divider>

          <Input
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
            autoComplete="email"
            editable={!isLoading}
          />
          <Input
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            autoComplete="current-password"
            editable={!isLoading}
          />
          <SubmitButton disabled={!canSubmit} onPress={handleLogin} activeOpacity={0.8}>
            {emailLoading ? <ActivityIndicator color="white" /> : <ButtonText>Sign In</ButtonText>}
          </SubmitButton>
        </Inner>
      </KeyboardAvoidingView>
    </Screen>
  );
}
