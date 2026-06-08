import React, { useCallback, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  PermissionsAndroid,
  TextInput,
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  type Permission,
} from 'react-native';
import styled from 'styled-components/native';
import { useStreamStore } from '@/store/stream.store';

// ─── Styled components ──────────────────────────────────────────────────────

const Card = styled.View`
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 16px;
`;

const Label = styled.Text`
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  letter-spacing: 1.5px;
  margin-bottom: 12px;
`;

const PickerRow = styled.TouchableOpacity<{ disabled?: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: 12px;
  background-color: rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 12px 14px;
  border-width: 1px;
  border-color: ${({ disabled }) =>
    disabled ? 'rgba(255,255,255,0.05)' : 'rgba(99, 102, 241, 0.4)'};
  opacity: ${({ disabled }) => (disabled ? 0.4 : 1)};
`;

const FilmIcon = styled.View`
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background-color: rgba(99, 102, 241, 0.25);
  align-items: center;
  justify-content: center;
`;

const FilmIconText = styled.Text`
  font-size: 18px;
`;

const FileInfo = styled.View`
  flex: 1;
`;

const FileNameText = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: white;
`;

const FileHintText = styled.Text`
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
`;

const ClearButton = styled.TouchableOpacity`
  padding: 6px;
`;

const ClearText = styled.Text`
  font-size: 18px;
  color: #475569;
`;

// ─── Modal styles ─────────────────────────────────────────────────────────────

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1e2130',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    gap: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: 'white',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 18,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.5)',
    color: 'white',
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
  },
  cancelText: {
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: 15,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#6366f1',
    alignItems: 'center',
  },
  confirmText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 15,
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getFileName(uri: string): string {
  const parts = uri.split('/');
  return parts[parts.length - 1] ?? uri;
}

async function requestAndroidMediaPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  // Android 13+ uses READ_MEDIA_VIDEO instead of READ_EXTERNAL_STORAGE
  const permission: Permission =
    (Platform.Version as number) >= 33
      ? 'android.permission.READ_MEDIA_VIDEO'
      : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

  const granted = await PermissionsAndroid.request(permission, {
    title: 'Accès aux vidéos',
    message: "TikLive Pro a besoin d'accéder à vos vidéos pour diffuser un fichier.",
    buttonNeutral: 'Plus tard',
    buttonNegative: 'Refuser',
    buttonPositive: 'Autoriser',
  });

  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  /** Disable picker once the stream is live */
  disabled?: boolean;
}

export function VideoFilePickerCard({ disabled = false }: Props): React.ReactElement {
  const { selectedVideoUri, setSelectedVideoUri } = useStreamStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const openModal = useCallback(async () => {
    if (disabled) return;

    if (Platform.OS === 'android') {
      const ok = await requestAndroidMediaPermission();
      if (!ok) {
        Alert.alert(
          'Permission refusée',
          "Autorisez l'accès aux vidéos dans les paramètres de l'application.",
        );
        return;
      }
    }

    // Pre-fill with existing value so user can edit
    setInputValue(selectedVideoUri ?? '');
    setModalVisible(true);
  }, [disabled, selectedVideoUri]);

  const handleConfirm = useCallback(() => {
    const uri = inputValue.trim();
    if (uri.length === 0) {
      setModalVisible(false);
      return;
    }

    const isHttp = uri.startsWith('http://') || uri.startsWith('https://');
    if (!isHttp) {
      Alert.alert(
        'URL invalide',
        'Seules les URLs HTTP ou HTTPS sont supportées.\n\n' +
          'Les chemins locaux (/storage/...) ne fonctionnent pas car le serveur ' +
          "n'a pas accès au système de fichiers de l'appareil.\n\n" +
          'Hébergez votre vidéo sur un serveur accessible et collez l\'URL ici.',
      );
      return;
    }

    setSelectedVideoUri(uri);
    setModalVisible(false);
  }, [inputValue, setSelectedVideoUri]);

  const handleCancel = useCallback(() => {
    setModalVisible(false);
    setInputValue('');
  }, []);

  const handleClear = useCallback(() => {
    setSelectedVideoUri(null);
  }, [setSelectedVideoUri]);

  return (
    <Card>
      <Label>SOURCE VIDÉO</Label>

      <PickerRow onPress={() => void openModal()} disabled={disabled} activeOpacity={0.7}>
        <FilmIcon>
          <FilmIconText>🎬</FilmIconText>
        </FilmIcon>

        <FileInfo>
          {selectedVideoUri ? (
            <>
              <FileNameText numberOfLines={1}>{getFileName(selectedVideoUri)}</FileNameText>
              <FileHintText>URL sélectionnée · sera diffusée</FileHintText>
            </>
          ) : (
            <>
              <FileNameText>Choisir un fichier vidéo</FileNameText>
              <FileHintText>
                {disabled
                  ? 'Non disponible pendant le live'
                  : 'URL HTTP/HTTPS de la vidéo à diffuser'}
              </FileHintText>
            </>
          )}
        </FileInfo>

        {selectedVideoUri && !disabled && (
          <ClearButton
            onPress={handleClear}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ClearText>✕</ClearText>
          </ClearButton>
        )}
      </PickerRow>

      {/* ── Cross-platform URL input modal ─────────────────────────────── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleCancel}
      >
        <KeyboardAvoidingView
          style={modalStyles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={handleCancel}
          />
          <View style={modalStyles.sheet}>
            <Text style={modalStyles.title}>URL de la vidéo</Text>
            <Text style={modalStyles.subtitle}>
              Entrez l&apos;URL HTTP/HTTPS de la vidéo à diffuser.{'\n'}
              Exemple : https://cdn.example.com/video.mp4
            </Text>

            <TextInput
              style={modalStyles.input}
              value={inputValue}
              onChangeText={setInputValue}
              placeholder="https://cdn.example.com/video.mp4"
              placeholderTextColor="#475569"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={handleConfirm}
              autoFocus
            />

            <View style={modalStyles.buttonRow}>
              <TouchableOpacity style={modalStyles.cancelBtn} onPress={handleCancel}>
                <Text style={modalStyles.cancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={modalStyles.confirmBtn} onPress={handleConfirm}>
                <Text style={modalStyles.confirmText}>Confirmer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Card>
  );
}
