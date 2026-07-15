import { MediaMtxStreamWatcher } from '../../src/infrastructure/mediamtx/mediamtx-stream-watcher.js';
import type { Logger } from '@tik-live-pro/logger';

const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn().mockReturnThis(),
  level: 'info',
  silent: jest.fn(),
} as unknown as Logger;

function mockPathsList(names: string[]): void {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ items: names.map((name) => ({ name, source: {} })) }),
  });
}

describe('MediaMtxStreamWatcher', () => {
  let onStreamArrived: jest.Mock;
  let onStreamEnded: jest.Mock;
  let watcher: MediaMtxStreamWatcher;

  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn();
    onStreamArrived = jest.fn().mockResolvedValue(undefined);
    onStreamEnded = jest.fn();
    watcher = new MediaMtxStreamWatcher(
      'http://mediamtx:9997',
      onStreamArrived,
      onStreamEnded,
      mockLogger,
      'user',
      'pass',
    );
  });

  afterEach(() => {
    watcher.stop();
    jest.useRealTimers();
  });

  async function tick(ms: number): Promise<void> {
    for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
      jest.advanceTimersByTime(1000);
      // flush the poll's pending microtasks (fetch + json + handler) before the next tick
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    }
  }

  it('fires onStreamArrived once for a new path and not again while it stays active', async () => {
    mockPathsList(['live/abc']);
    watcher.start();
    await tick(3000);
    expect(onStreamArrived).toHaveBeenCalledTimes(1);
    expect(onStreamArrived).toHaveBeenCalledWith('abc');
    expect(onStreamEnded).not.toHaveBeenCalled();
  });

  it('does not call onStreamEnded when a path reappears within the grace window', async () => {
    mockPathsList(['live/abc']);
    watcher.start();
    await tick(2000);
    expect(onStreamArrived).toHaveBeenCalledTimes(1);

    // Path drops out (WHIP flap) for 4 consecutive polls — below the 8-poll grace threshold.
    mockPathsList([]);
    await tick(4000);
    expect(onStreamEnded).not.toHaveBeenCalled();

    // Reappears — should be treated as the same stream, no re-arrival.
    mockPathsList(['live/abc']);
    await tick(2000);
    expect(onStreamEnded).not.toHaveBeenCalled();
    expect(onStreamArrived).toHaveBeenCalledTimes(1);
  });

  it('calls onStreamEnded once the path has been missing for the full grace window', async () => {
    mockPathsList(['live/abc']);
    watcher.start();
    await tick(2000);
    expect(onStreamArrived).toHaveBeenCalledTimes(1);

    mockPathsList([]);
    await tick(9000);
    expect(onStreamEnded).toHaveBeenCalledTimes(1);
    expect(onStreamEnded).toHaveBeenCalledWith('abc');
  });

  it('treats a stream re-arriving after onStreamEnded fired as a brand-new arrival', async () => {
    mockPathsList(['live/abc']);
    watcher.start();
    await tick(2000);

    mockPathsList([]);
    await tick(9000);
    expect(onStreamEnded).toHaveBeenCalledTimes(1);

    mockPathsList(['live/abc']);
    await tick(2000);
    expect(onStreamArrived).toHaveBeenCalledTimes(2);
  });
});
