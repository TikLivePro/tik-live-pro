import type { AuthConfiguration } from 'react-native-app-auth';

const REDIRECT_URI = 'com.tiklivepro:/oauth2redirect';

export const GOOGLE_CONFIG: AuthConfiguration = {
  issuer: 'https://accounts.google.com',
  clientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
  redirectUrl: `${REDIRECT_URI}/google`,
  scopes: ['openid', 'profile', 'email'],
};

export const FACEBOOK_CONFIG: AuthConfiguration = {
  issuer: undefined,
  serviceConfiguration: {
    authorizationEndpoint: 'https://www.facebook.com/v21.0/dialog/oauth',
    tokenEndpoint: 'https://graph.facebook.com/v21.0/oauth/access_token',
  },
  clientId: process.env['FACEBOOK_APP_ID'] ?? '',
  redirectUrl: `fb${process.env['FACEBOOK_APP_ID'] ?? ''}://authorize`,
  scopes: ['public_profile', 'email'],
};

// TikTok requires `client_key` in the authorization URL via additionalParameters.
export const TIKTOK_CONFIG: AuthConfiguration = {
  issuer: undefined,
  serviceConfiguration: {
    authorizationEndpoint: 'https://www.tiktok.com/v2/auth/authorize',
    tokenEndpoint: 'https://open.tiktokapis.com/v2/oauth/token/',
  },
  clientId: process.env['TIKTOK_CLIENT_KEY'] ?? '',
  clientSecret: process.env['TIKTOK_CLIENT_SECRET'] ?? '',
  redirectUrl: `${REDIRECT_URI}/tiktok`,
  scopes: ['user.info.basic'],
  additionalParameters: {
    client_key: process.env['TIKTOK_CLIENT_KEY'] ?? '',
  },
};

export const OAUTH_CONFIGS = {
  google: GOOGLE_CONFIG,
  facebook: FACEBOOK_CONFIG,
  tiktok: TIKTOK_CONFIG,
} as const;
