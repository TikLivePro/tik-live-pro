export type ServiceStatus = 'operational' | 'degraded' | 'outage' | 'unknown';

export interface ServiceCheck {
  id: string;
  name: string;
  description: string;
  group: 'platform' | 'streaming' | 'infrastructure';
  url: string;
  status: ServiceStatus;
  latencyMs: number | null;
  checkedAt: string;
}

export interface StatusSummary {
  overall: ServiceStatus;
  services: ServiceCheck[];
  checkedAt: string;
}

const SERVICE_DEFS: Array<{
  id: string;
  name: string;
  description: string;
  group: ServiceCheck['group'];
  internalUrl: string;
}> = [
  {
    id: 'api-gateway',
    name: 'API Gateway',
    description: 'Authentication, rate limiting, and request routing',
    group: 'platform',
    internalUrl: `${process.env.API_GATEWAY_URL ?? 'http://api-gateway:3000'}/health`,
  },
  {
    id: 'auth',
    name: 'Authentication',
    description: 'User login, registration, and token management',
    group: 'platform',
    internalUrl: `${process.env.AUTH_SERVICE_URL ?? 'http://auth:3001'}/health`,
  },
  {
    id: 'users',
    name: 'User Profiles',
    description: 'User account data and preferences',
    group: 'platform',
    internalUrl: `${process.env.USERS_SERVICE_URL ?? 'http://users:3002'}/health`,
  },
  {
    id: 'live-session',
    name: 'Live Sessions',
    description: 'Session lifecycle management for broadcasts',
    group: 'platform',
    internalUrl: `${process.env.LIVE_SESSION_SERVICE_URL ?? 'http://live-session:3003'}/health`,
  },
  {
    id: 'billing',
    name: 'Billing',
    description: 'Subscription management and payment processing',
    group: 'platform',
    internalUrl: `${process.env.BILLING_SERVICE_URL ?? 'http://billing:3004'}/health`,
  },
  {
    id: 'integrations',
    name: 'Social Integrations',
    description: 'TikTok and Facebook account connections',
    group: 'platform',
    internalUrl: `${process.env.INTEGRATIONS_SERVICE_URL ?? 'http://integrations:3005'}/health`,
  },
  {
    id: 'comments',
    name: 'Live Comments',
    description: 'Real-time comment aggregation and delivery',
    group: 'platform',
    internalUrl: `${process.env.COMMENTS_SERVICE_URL ?? 'http://comments:3006'}/health`,
  },
  {
    id: 'notifications',
    name: 'Notifications',
    description: 'Push and email notification delivery',
    group: 'platform',
    internalUrl: `${process.env.NOTIFICATIONS_SERVICE_URL ?? 'http://notifications:3007'}/health`,
  },
  {
    id: 'analytics',
    name: 'Analytics',
    description: 'Usage metrics and event aggregation',
    group: 'platform',
    internalUrl: `${process.env.ANALYTICS_SERVICE_URL ?? 'http://analytics:3008'}/health`,
  },
  {
    id: 'stream-orchestrator',
    name: 'Stream Orchestrator',
    description: 'Multi-destination broadcast coordination',
    group: 'streaming',
    internalUrl: `${process.env.STREAM_ORCHESTRATOR_URL ?? 'http://stream-orchestrator:3009'}/health`,
  },
  {
    id: 'mediamtx',
    name: 'Media Server',
    description: 'HLS and WebRTC streaming relay (MediaMTX)',
    group: 'streaming',
    internalUrl: `${process.env.MEDIAMTX_API_URL ?? 'http://mediamtx:9997'}/v3/paths/list`,
  },
  {
    id: 'nats',
    name: 'Message Bus',
    description: 'NATS JetStream event bus',
    group: 'infrastructure',
    internalUrl: `${process.env.NATS_MONITORING_URL ?? 'http://nats:8222'}/healthz`,
  },
];

async function checkService(def: (typeof SERVICE_DEFS)[number]): Promise<ServiceCheck> {
  const start = Date.now();
  let status: ServiceStatus = 'unknown';
  let latencyMs: number | null = null;

  try {
    const res = await fetch(def.internalUrl, {
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    });
    latencyMs = Date.now() - start;
    if (res.ok) {
      status = latencyMs > 2000 ? 'degraded' : 'operational';
    } else {
      status = res.status >= 500 ? 'outage' : 'degraded';
    }
  } catch {
    status = 'outage';
  }

  return {
    id: def.id,
    name: def.name,
    description: def.description,
    group: def.group,
    url: def.internalUrl,
    status,
    latencyMs,
    checkedAt: new Date().toISOString(),
  };
}

function deriveOverall(services: ServiceCheck[]): ServiceStatus {
  if (services.some((s) => s.status === 'outage')) return 'outage';
  if (services.some((s) => s.status === 'degraded' || s.status === 'unknown')) return 'degraded';
  return 'operational';
}

export async function fetchStatus(): Promise<StatusSummary> {
  const results = await Promise.allSettled(SERVICE_DEFS.map(checkService));
  const services = results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : ({
          id: SERVICE_DEFS[i].id,
          name: SERVICE_DEFS[i].name,
          description: SERVICE_DEFS[i].description,
          group: SERVICE_DEFS[i].group,
          url: SERVICE_DEFS[i].internalUrl,
          status: 'unknown' as ServiceStatus,
          latencyMs: null,
          checkedAt: new Date().toISOString(),
        }),
  );

  return {
    overall: deriveOverall(services),
    services,
    checkedAt: new Date().toISOString(),
  };
}
