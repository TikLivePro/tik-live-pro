import type { FastifyInstance } from 'fastify';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

// ---------------------------------------------------------------------------
// Reusable schema fragments
// ---------------------------------------------------------------------------

const bearerAuth = [{ BearerAuth: [] }];

const errorSchema = (description: string) => ({
  description,
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string', description: 'Machine-readable error code.', example: 'NOT_FOUND' },
        message: { type: 'string', description: 'Human-readable error message.', example: 'Session not found' },
      },
    },
  },
});

const streamHealthSnapshotSchema = {
  type: 'object',
  description: 'A single stream health sample captured every 30 s during a live session.',
  properties: {
    timestamp: { type: 'string', format: 'date-time', description: 'When this sample was captured.' },
    bitrate: { type: 'integer', description: 'Video bitrate in kbps.', example: 3500 },
    fps: { type: 'number', description: 'Frames per second.', example: 29.97 },
    droppedFrames: { type: 'integer', description: 'Number of frames dropped since the last sample.', example: 2 },
    latencyMs: { type: 'integer', description: 'Estimated stream latency in milliseconds.', example: 850 },
  },
};

// ---------------------------------------------------------------------------

export function registerAnalyticsRoutes(fastify: FastifyInstance, _deps: { db: NodePgDatabase }): void {
  // GET /analytics/overview --------------------------------------------------
  fastify.get(
    '/analytics/overview',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Get analytics overview',
        description: `
Returns aggregated streaming performance metrics for the authenticated user across all sessions within an optional date range.

**Data freshness:** overview metrics are computed from events stored in the analytics database and are updated in near real-time (< 5 s lag) via NATS event ingestion.

**Premium feature:** detailed per-platform breakdown and comment velocity charts require a Premium subscription. Free users receive summary totals only.
        `.trim(),
        security: bearerAuth,
        querystring: {
          type: 'object',
          properties: {
            from: {
              type: 'string',
              format: 'date',
              description: 'Start date for the analytics window (ISO 8601 date, inclusive). Defaults to 30 days ago.',
              example: '2026-05-01',
            },
            to: {
              type: 'string',
              format: 'date',
              description: 'End date for the analytics window (ISO 8601 date, inclusive). Defaults to today.',
              example: '2026-05-19',
            },
          },
        },
        response: {
          200: {
            description: 'Aggregated overview metrics.',
            type: 'object',
            required: ['data'],
            properties: {
              data: {
                type: 'object',
                required: ['periodStart', 'periodEnd', 'totalSessions', 'totalDurationSeconds', 'totalComments'],
                properties: {
                  periodStart: {
                    type: 'string',
                    format: 'date',
                    description: 'Actual start date of the analytics window.',
                    example: '2026-05-01',
                  },
                  periodEnd: {
                    type: 'string',
                    format: 'date',
                    description: 'Actual end date of the analytics window.',
                    example: '2026-05-19',
                  },
                  totalSessions: {
                    type: 'integer',
                    description: 'Total number of completed live sessions in the window.',
                    example: 12,
                  },
                  totalDurationSeconds: {
                    type: 'integer',
                    description: 'Sum of all session durations in seconds.',
                    example: 86400,
                  },
                  totalComments: {
                    type: 'integer',
                    description: 'Total comments received across all sessions and platforms.',
                    example: 3452,
                  },
                  avgSessionDurationSeconds: {
                    type: 'integer',
                    description: 'Average session duration in seconds.',
                    example: 7200,
                  },
                  platforms: {
                    type: 'array',
                    description: 'Per-platform breakdown (Premium feature — free users receive an empty array).',
                    items: {
                      type: 'object',
                      properties: {
                        platform: { type: 'string', enum: ['tiktok', 'facebook'], example: 'tiktok' },
                        sessions: { type: 'integer', description: 'Sessions that included this platform.', example: 10 },
                        comments: { type: 'integer', description: 'Comments received from this platform.', example: 2100 },
                        avgBitrateKbps: { type: 'integer', description: 'Average bitrate during active broadcasts (kbps).', example: 3200 },
                      },
                    },
                  },
                },
              },
            },
          },
          401: errorSchema('Missing or invalid Bearer token.'),
          422: errorSchema('Invalid date range — `from` must be before `to`.'),
        },
      },
    },
    async (_request, reply) => {
      return reply.status(200).send({
        data: {
          periodStart: '2026-04-19',
          periodEnd: '2026-05-19',
          totalSessions: 0,
          totalDurationSeconds: 0,
          totalComments: 0,
          avgSessionDurationSeconds: 0,
          platforms: [],
        },
      });
    },
  );

  // GET /analytics/sessions/:sessionId ---------------------------------------
  fastify.get<{ Params: { sessionId: string } }>(
    '/analytics/sessions/:sessionId',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Get session analytics',
        description: `
Returns detailed performance analytics for a specific completed or live session.

**Includes:**
- Session duration and status
- Total comment count per platform
- Stream health time-series (bitrate, FPS, dropped frames) sampled every 30 s
- Per-platform stream status history

**Availability:** data is available immediately for live sessions and is finalized within 30 s of a session ending.

**Authorization:** only the session owner can access its analytics.
        `.trim(),
        security: bearerAuth,
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: {
              type: 'string',
              format: 'uuid',
              description: 'Live session ID.',
              example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            },
          },
        },
        response: {
          200: {
            description: 'Session analytics report.',
            type: 'object',
            required: ['data'],
            properties: {
              data: {
                type: 'object',
                required: ['sessionId', 'durationSeconds', 'totalComments', 'streamHealth', 'platforms'],
                properties: {
                  sessionId: { type: 'string', format: 'uuid' },
                  title: { type: 'string', description: 'Session title.', example: 'Morning coding stream' },
                  startedAt: { type: 'string', format: 'date-time', nullable: true },
                  endedAt: { type: 'string', format: 'date-time', nullable: true },
                  durationSeconds: {
                    type: 'integer',
                    description: 'Total stream duration in seconds (0 if the session never went live).',
                    example: 3600,
                  },
                  totalComments: {
                    type: 'integer',
                    description: 'Total comments received across all platforms.',
                    example: 287,
                  },
                  streamHealth: {
                    type: 'array',
                    description: 'Time-series stream health samples (30 s interval). Empty if the session never went live.',
                    items: streamHealthSnapshotSchema,
                  },
                  platforms: {
                    type: 'array',
                    description: 'Per-platform performance summary.',
                    items: {
                      type: 'object',
                      properties: {
                        platform: { type: 'string', enum: ['tiktok', 'facebook'] },
                        comments: { type: 'integer', description: 'Comments from this platform.', example: 150 },
                        streamStatus: {
                          type: 'string',
                          enum: ['live', 'ended', 'error', 'never_started'],
                          description: 'Final stream status for this platform.',
                          example: 'ended',
                        },
                        durationSeconds: {
                          type: 'integer',
                          description: 'How long the stream was live on this platform in seconds.',
                          example: 3580,
                        },
                        avgBitrateKbps: {
                          type: 'integer',
                          description: 'Average video bitrate (kbps) for this platform\'s stream.',
                          example: 3200,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: errorSchema('Missing or invalid Bearer token.'),
          403: errorSchema('This session belongs to a different user.'),
          404: errorSchema('Session not found.'),
        },
      },
    },
    async (_request, reply) => {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
    },
  );
}
