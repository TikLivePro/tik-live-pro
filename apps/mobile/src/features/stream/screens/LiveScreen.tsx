import React, { useRef, useState } from 'react';
import { View, StyleSheet, Dimensions, Text, TouchableOpacity } from 'react-native';
import Video from 'react-native-video';
import styled from 'styled-components/native';
import { useStreamStore } from '@/store/stream.store';
import { useElapsedTime } from '../hooks/useElapsedTime';
import { useVideoStream } from '../hooks/useVideoStream';
import { AccountStatusList } from '../components/AccountStatusList';
import { StopLiveButton } from '../components/StopLiveButton';
import { VideoFilePickerCard } from '../components/VideoFilePickerCard';
import type { AppScreenProps } from '@/navigation/types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Layout ──────────────────────────────────────────────────────────────────

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

// ─── Video preview styles (plain StyleSheet — Video component needs them) ─────

const styles = StyleSheet.create({
  /** Full-screen video preview rendered below the controls overlay */
  videoContainer: {
    width: SCREEN_W,
    height: Math.round(SCREEN_H * 0.35), // 35 % of screen height
    backgroundColor: '#000',
    marginHorizontal: 0,
    borderRadius: 16,
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  videoOverlayRow: {
    position: 'absolute',
    bottom: 8,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  videoStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  videoStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#22c55e',
    letterSpacing: 0.3,
  },
  videoErrorOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 8,
  },
  videoErrorIcon: {
    fontSize: 28,
  },
  videoErrorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f87171',
  },
  videoErrorMsg: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
  },
  videoErrorDismiss: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(99,102,241,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.5)',
  },
  videoErrorDismissText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#a5b4fc',
  },
});

// ─── Component ────────────────────────────────────────────────────────────────

export function LiveScreen({ navigation }: AppScreenProps<'Live'>): React.ReactElement {
  const { currentSession, selectedVideoUri, setSelectedVideoUri } = useStreamStore();
  const isLive = currentSession?.status === 'live';
  const elapsed = useElapsedTime(isLive ? (currentSession?.startedAt ?? null) : null);
  const destinations = currentSession?.destinations ?? [];
  const liveCount = destinations.filter((d) => d.status === 'live').length;

  const videoRef = useRef(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Signals the backend to broadcast the selected video to RTMP destinations
  // when the session goes live.
  useVideoStream();

  // Clear playback error whenever the user selects a new URL
  React.useEffect(() => {
    setVideoError(null);
  }, [selectedVideoUri]);

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
          {/* ── Video preview ──────────────────────────────────────────────── */}
          {selectedVideoUri ? (
            <View style={styles.videoContainer}>
              {videoError ? (
                /* Error state — URL not accessible from device */
                <View style={styles.videoErrorOverlay}>
                  <Text style={styles.videoErrorIcon}>⚠️</Text>
                  <Text style={styles.videoErrorTitle}>Vidéo inaccessible</Text>
                  <Text style={styles.videoErrorMsg}>{videoError}</Text>
                  <TouchableOpacity
                    style={styles.videoErrorDismiss}
                    onPress={() => {
                      setVideoError(null);
                      setSelectedVideoUri(null);
                    }}
                  >
                    <Text style={styles.videoErrorDismissText}>Changer l'URL</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Video
                  ref={videoRef}
                  source={{ uri: selectedVideoUri }}
                  style={styles.video}
                  resizeMode="cover"
                  repeat={true}
                  muted={false}
                  paused={false}
                  playInBackground={false}
                  ignoreSilentSwitch="ignore"
                  onError={(e) => {
                    console.warn('[LiveScreen] Video playback error:', e);
                    setVideoError(
                      "L'URL n'est pas accessible depuis cet appareil.\n" +
                        'Vérifiez que le serveur est joignable et que la vidéo est publique.',
                    );
                  }}
                />
              )}
              {/* Overlay badge: green when live, grey when not yet started */}
              {!videoError && (
                <View style={styles.videoOverlayRow} pointerEvents="none">
                  {/* eslint-disable-next-line react-native/no-inline-styles */}
                  <View
                    style={[
                      styles.videoStatusDot,
                      !isLive && { backgroundColor: '#64748b' },
                    ]}
                  />
                  {/* eslint-disable-next-line react-native/no-inline-styles */}
                  <BrandText
                    // @ts-ignore — reuse BrandText but override color
                    style={{
                      fontSize: 11,
                      color: isLive ? '#22c55e' : '#64748b',
                      fontWeight: '700',
                      letterSpacing: 0.3,
                    }}
                  >
                    {isLive ? 'DIFFUSION EN COURS' : 'VIDÉO PRÊTE'}
                  </BrandText>
                </View>
              )}
            </View>
          ) : isLive ? (
            /* Live but no video selected → show placeholder */
            <View
              style={[
                styles.videoContainer,
                { alignItems: 'center', justifyContent: 'center' },
              ]}
            >
              <BrandText style={{ fontSize: 14, color: '#64748b' }}>
                📷  Aucun fichier vidéo sélectionné
              </BrandText>
            </View>
          ) : null}

          {/* ── Stats ─────────────────────────────────────────────────────── */}
          <StatsCard>
            <StatBlock>
              <StatLabel>Durée du live</StatLabel>
              <StatValue>{elapsed}</StatValue>
            </StatBlock>
            <StatBlock style={{ alignItems: 'flex-end' }}>
              <StatLabel>Comptes en direct</StatLabel>
              <LiveCountValue>
                {liveCount} / {destinations.length}
              </LiveCountValue>
            </StatBlock>
          </StatsCard>

          <AccountStatusList destinations={destinations} />

          {/* Video file picker — always shown, including during live */}
          <VideoFilePickerCard />
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
