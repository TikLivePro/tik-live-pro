/**
 * NATS JetStream subject hierarchy for TikLivePro.
 * Format: <domain>.<entity>.<action>
 * Versioning is embedded in the event payload (version field).
 */
export const Subjects = {
  // Auth domain
  AUTH_USER_REGISTERED: 'auth.user.registered',
  AUTH_USER_LOGGED_IN: 'auth.user.logged_in',
  AUTH_TOKEN_REFRESHED: 'auth.token.refreshed',

  // User domain
  USER_PROFILE_UPDATED: 'user.profile.updated',
  USER_DELETED: 'user.deleted',

  // Social integrations
  INTEGRATION_ACCOUNT_CONNECTED: 'integration.account.connected',
  INTEGRATION_ACCOUNT_DISCONNECTED: 'integration.account.disconnected',
  INTEGRATION_TOKEN_REFRESHED: 'integration.token.refreshed',
  INTEGRATION_TOKEN_EXPIRED: 'integration.token.expired',
  INTEGRATION_PLATFORM_SESSION_ENDED: 'integration.platform.session_ended',

  // Live session lifecycle
  SESSION_CREATED: 'session.created',
  SESSION_STARTING: 'session.starting',
  SESSION_LIVE: 'session.live',
  SESSION_ENDED: 'session.ended',
  SESSION_ERROR: 'session.error',

  // Stream orchestration
  STREAM_DESTINATION_ADDED: 'stream.destination.added',
  STREAM_DESTINATION_REMOVED: 'stream.destination.removed',
  STREAM_DESTINATION_STATUS_CHANGED: 'stream.destination.status_changed',
  STREAM_HEALTH_UPDATED: 'stream.health.updated',

  // Comments
  COMMENT_RECEIVED: 'comment.received',
  COMMENT_BATCH_RECEIVED: 'comment.batch_received',
  COMMENT_POSTED: 'comment.posted',
  COMMENT_REPLIED: 'comment.replied',

  // Billing
  BILLING_SUBSCRIPTION_CREATED: 'billing.subscription.created',
  BILLING_SUBSCRIPTION_UPDATED: 'billing.subscription.updated',
  BILLING_SUBSCRIPTION_CANCELED: 'billing.subscription.canceled',
  BILLING_ENTITLEMENT_UPDATED: 'billing.entitlement.updated',
  BILLING_PAYMENT_FAILED: 'billing.payment.failed',

  // Notifications
  NOTIFICATION_PUSH_REQUESTED: 'notification.push.requested',
  NOTIFICATION_EMAIL_REQUESTED: 'notification.email.requested',

  // Analytics
  ANALYTICS_EVENT_TRACKED: 'analytics.event.tracked',

  // Dead-letter queue prefix
  DLQ_PREFIX: 'dlq',
} as const;

export type Subject = (typeof Subjects)[keyof typeof Subjects];
