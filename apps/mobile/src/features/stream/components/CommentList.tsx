import React from 'react';
import { FlatList } from 'react-native';
import styled from 'styled-components/native';
import type { AppTheme } from '@/theme/theme';
import type { Comment } from '@tik-live-pro/shared-types';
import { useStreamStore } from '@/store/stream.store';

const PLATFORM_COLOR: Record<string, string> = {
  tiktok: '#ff0050',
  facebook: '#1877f2',
};

const CommentRow = styled.View<{ theme: AppTheme; platform: string }>`
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.sm}px;
  padding: ${({ theme }) => theme.spacing.sm}px ${({ theme }) => theme.spacing.md}px;
  border-left-width: 3px;
  border-left-color: ${({ platform }) => PLATFORM_COLOR[platform] ?? '#94a3b8'};
`;

const Avatar = styled.Image`
  width: 28px;
  height: 28px;
  border-radius: 14px;
`;

const AuthorText = styled.Text<{ theme: AppTheme }>`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.foreground};
`;

const ContentText = styled.Text<{ theme: AppTheme }>`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.foreground};
  flex-shrink: 1;
`;

function CommentItem({ item }: { item: Comment }) {
  return (
    <CommentRow platform={item.platform}>
      {item.authorAvatarUrl ? (
        <Avatar source={{ uri: item.authorAvatarUrl }} />
      ) : null}
      <ContentText>
        <AuthorText>{item.authorName} </AuthorText>
        {item.content}
      </ContentText>
    </CommentRow>
  );
}

export function CommentList() {
  const { comments } = useStreamStore();

  return (
    <FlatList
      data={comments}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <CommentItem item={item} />}
      inverted
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
    />
  );
}
