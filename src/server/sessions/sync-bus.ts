import { WebSocket } from 'ws'
import type { SyncEvent } from '../../shared/types/sync.js'

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
