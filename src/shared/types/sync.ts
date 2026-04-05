export type SyncEvent =
  | { type: 'session-created'; session: { id: string; label: string; createdAt: Date; cols: number; rows: number } }
  | { type: 'session-deleted'; sessionId: string }
  | { type: 'session-renamed'; sessionId: string; label: string }
  | { type: 'input-lock-acquired'; sessionId: string; clientId: string }
  | { type: 'input-lock-released'; sessionId: string }
  | { type: 'data-activity'; sessionId: string }
  | { type: 'guest-viewer-added'; sessionId: string; guestName: string; clientId: string }
  | { type: 'guest-viewer-removed'; sessionId: string; guestName: string; clientId: string }
  | { type: 'lock-request'; requestId: string; sessionId: string; guestName: string }
  | { type: 'lock-request-resolved'; requestId: string; approved: boolean }
  | { type: 'lock-request-expired'; requestId: string }
  | { type: 'guest-revoked'; clientIds: string[] }
