'use client';

import { useEffect, useState, useCallback } from 'react';
import type { StatusSummary, ServiceCheck, ServiceStatus } from '@/lib/services';

const REFRESH_INTERVAL_MS = 30_000;

const STATUS_CONFIG: Record<
  ServiceStatus,
  { label: string; dot: string; banner: string; icon: string }
> = {
  operational: {
    label: 'Operational',
    dot: 'bg-[#3fb950]',
    banner: 'bg-[#0d2318] border-[#3fb950]/40 text-[#3fb950]',
    icon: '✓',
  },
  degraded: {
    label: 'Degraded',
    dot: 'bg-[#d29922]',
    banner: 'bg-[#1f1900] border-[#d29922]/40 text-[#d29922]',
    icon: '⚠',
  },
  outage: {
    label: 'Outage',
    dot: 'bg-[#f85149]',
    banner: 'bg-[#2a0e0e] border-[#f85149]/40 text-[#f85149]',
    icon: '✕',
  },
  unknown: {
    label: 'Unknown',
    dot: 'bg-[#8b949e]',
    banner: 'bg-[#161b22] border-[#8b949e]/40 text-[#8b949e]',
    icon: '?',
  },
};

const OVERALL_MESSAGES: Record<ServiceStatus, string> = {
  operational: 'All systems operational',
  degraded: 'Partial system degradation',
  outage: 'Service disruption in progress',
  unknown: 'Status unknown',
};

const GROUP_LABELS: Record<ServiceCheck['group'], string> = {
  platform: 'Platform Services',
  streaming: 'Streaming Infrastructure',
  infrastructure: 'Core Infrastructure',
};

const GROUP_ORDER: ServiceCheck['group'][] = ['platform', 'streaming', 'infrastructure'];

function formatLatency(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function ServiceRow({ svc }: { svc: ServiceCheck }): React.JSX.Element {
  const cfg = STATUS_CONFIG[svc.status];
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#30363d] last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`shrink-0 w-2.5 h-2.5 rounded-full ${cfg.dot} shadow-[0_0_6px_currentColor]`}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#e6edf3] truncate">{svc.name}</p>
          <p className="text-xs text-[#8b949e] truncate hidden sm:block">{svc.description}</p>
        </div>
      </div>
      <div className="flex items-center gap-4 ml-4 shrink-0">
        <span className="text-xs text-[#8b949e] hidden md:block">{formatLatency(svc.latencyMs)}</span>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.banner}`}
        >
          {cfg.label}
        </span>
      </div>
    </div>
  );
}

function ServiceGroup({
  group,
  services,
}: {
  group: ServiceCheck['group'];
  services: ServiceCheck[];
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-[#30363d] overflow-hidden">
      <div className="px-4 py-2.5 bg-[#161b22] border-b border-[#30363d]">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8b949e]">
          {GROUP_LABELS[group]}
        </h2>
      </div>
      <div className="px-4 bg-[#0d1117]">
        {services.map((svc) => (
          <ServiceRow key={svc.id} svc={svc} />
        ))}
      </div>
    </div>
  );
}

function OverallBanner({ status, checkedAt }: { status: ServiceStatus; checkedAt: string }): React.JSX.Element {
  const cfg = STATUS_CONFIG[status];
  return (
    <div
      className={`flex items-center gap-3 px-5 py-4 rounded-xl border ${cfg.banner} text-sm font-medium`}
      role="status"
    >
      <span className="text-lg leading-none" aria-hidden="true">
        {cfg.icon}
      </span>
      <span className="flex-1">{OVERALL_MESSAGES[status]}</span>
      <span className="text-xs opacity-70 hidden sm:block">
        Updated {formatTime(checkedAt)}
      </span>
    </div>
  );
}

function Spinner(): React.JSX.Element {
  return (
    <svg
      className="animate-spin h-4 w-4 text-[#8b949e]"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export default function StatusPage(): React.JSX.Element {
  const [summary, setSummary] = useState<StatusSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nextRefreshIn, setNextRefreshIn] = useState(REFRESH_INTERVAL_MS / 1000);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch failed');
      const data: StatusSummary = await res.json();
      setSummary(data);
      setNextRefreshIn(REFRESH_INTERVAL_MS / 1000);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (loading) return;
    const tick = setInterval(() => {
      setNextRefreshIn((n) => Math.max(0, n - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, [loading]);

  const groupedServices =
    summary?.services.reduce<Partial<Record<ServiceCheck['group'], ServiceCheck[]>>>((acc, svc) => {
      (acc[svc.group] ??= []).push(svc);
      return acc;
    }, {}) ?? {};

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3]">
      {/* Header */}
      <header className="border-b border-[#30363d] bg-[#0d1117]/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className="inline-flex items-center justify-center w-7 h-7 rounded-md font-bold text-sm"
              style={{ background: '#fe2c55', color: '#fff' }}
              aria-hidden="true"
            >
              T
            </span>
            <span className="font-semibold text-[#e6edf3] text-sm tracking-tight">
              TikLive Pro Status
            </span>
          </div>
          <a
            href="https://tiklivepro.me"
            className="text-xs text-[#8b949e] hover:text-[#e6edf3] transition-colors"
          >
            tiklivepro.me ↗
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Overall status */}
        {error && !summary && (
          <div className="flex items-center gap-3 px-5 py-4 rounded-xl border border-[#f85149]/40 bg-[#2a0e0e] text-[#f85149] text-sm font-medium">
            <span>✕</span>
            <span>Unable to reach status API — check your network.</span>
          </div>
        )}

        {summary && (
          <OverallBanner status={summary.overall} checkedAt={summary.checkedAt} />
        )}

        {!summary && !error && (
          <div className="flex items-center gap-3 px-5 py-4 rounded-xl border border-[#30363d] bg-[#161b22] text-[#8b949e] text-sm">
            <Spinner />
            <span>Checking service status…</span>
          </div>
        )}

        {/* Service groups */}
        {GROUP_ORDER.map((group) => {
          const services = groupedServices[group];
          if (!services?.length) return null;
          return <ServiceGroup key={group} group={group} services={services} />;
        })}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 text-xs text-[#8b949e]">
          <span>
            {loading ? (
              <span className="flex items-center gap-1.5">
                <Spinner />
                Refreshing…
              </span>
            ) : (
              `Auto-refresh in ${nextRefreshIn}s`
            )}
          </span>
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 rounded-md border border-[#30363d] bg-[#161b22] hover:bg-[#30363d] disabled:opacity-50 transition-colors text-[#e6edf3] disabled:cursor-not-allowed"
          >
            Refresh now
          </button>
        </div>
      </main>

      {/* Minimal footer */}
      <footer className="border-t border-[#30363d] mt-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#8b949e]">
          <span>© {new Date().getFullYear()} TikLive Pro</span>
          <div className="flex gap-4">
            <a href="https://tiklivepro.me" className="hover:text-[#e6edf3] transition-colors">
              App
            </a>
            <a
              href="mailto:support@tiklivepro.me"
              className="hover:text-[#e6edf3] transition-colors"
            >
              Support
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
