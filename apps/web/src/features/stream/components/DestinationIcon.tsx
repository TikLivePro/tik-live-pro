'use client';

import { TikTokIcon, FacebookIcon, GlobeIcon } from '@/features/auth/components/AuthIcons';
import { getPlatformIdentityColor } from '@/lib/platform.consts';
import type { SocialPlatform } from '@tik-live-pro/shared-types';

/** Small platform-tinted destination chip icon. */
export function DestinationIcon({ platform }: { platform: SocialPlatform }): React.ReactElement {
  const color = getPlatformIdentityColor(platform);
  if (platform === 'tiktok' || platform === 'facebook') {
    return (
      <span
        className="flex h-5 w-5 items-center justify-center rounded"
        style={color ? { backgroundColor: `${color}26`, color } : undefined}
        title={platform}
      >
        {platform === 'tiktok' ? <TikTokIcon className="h-3 w-3" /> : <FacebookIcon className="h-3 w-3" />}
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded bg-muted text-muted-foreground">
      <GlobeIcon className="h-3 w-3" />
    </span>
  );
}
