import { WebSocket } from 'ws'

export type SyncEvent =
  | { type: 'session-created'; session: { id: string; label: string; createdAt: Date; cols: number; rows: number } }
  | { type: 'session-deleted'; sessionId: string }
  | { type: 'session-renamed'; sessionId: string; label: string }
  | { type: 'input-lock-acquired'; sessionId: string; clientId: string }
  | { type: 'input-lock-released'; sessionId: string }
  | { type: 'data-activity'; sessionId: string }

const syncClients = new Set<WebSocket>()

export function addSyncClient(ws: WebSocket): void {
  syncClients.add(ws)
  ws.on('close', () => syncClients.delete(ws))
  ws.on('error', () => syncClients.delete(ws))
}

export function broadcastSync(event: SyncEvent): void {
  const data = JSON.stringify(event)
  for (const client of syncClients) {
    if (client.readyState === WebSocket.OPEN) client.send(data)
  }
}
