export interface BaseEvent<T = unknown> {
  eventId: string;
  version: number;
  subject: string;
  occurredAt: string;
  correlationId: string;
  traceId: string;
  payload: T;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
}

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
