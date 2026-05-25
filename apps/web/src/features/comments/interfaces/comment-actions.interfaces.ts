export interface SendCommentPayload {
  sessionId: string;
  content: string;
  mediaUrls?: string[];
}

export interface ReplyCommentPayload {
  content: string;
  mediaUrls?: string[];
}
