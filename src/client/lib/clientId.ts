/**
 * Generate a random UUID for client identification
 */
function randomUUID(): string {
  if (crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for browsers that don't support crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * Get or create a persistent client ID for session synchronization
 */
export function getClientId(): string {
  let id = localStorage.getItem('wt_client_id')
  if (!id) {
    id = randomUUID()
    localStorage.setItem('wt_client_id', id)
  }
  return id
}
