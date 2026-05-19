import type { IPlatformAdapter } from '../interface/platform-adapter.interface.js';
import type { SocialPlatform } from '@tik-live-pro/shared-types';

export class AdapterRegistry {
  private readonly adapters = new Map<SocialPlatform, IPlatformAdapter>();

  register(adapter: IPlatformAdapter): void {
    this.adapters.set(adapter.platform, adapter);
  }

  get(platform: SocialPlatform): IPlatformAdapter {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`No adapter registered for platform: ${platform}`);
    }
    return adapter;
  }

  has(platform: SocialPlatform): boolean {
    return this.adapters.has(platform);
  }

  supported(): SocialPlatform[] {
    return Array.from(this.adapters.keys());
  }
}
