export interface SessionInfo {
  id: string
  label: string
  createdAt: string
  cols: number
  rows: number
  inputLockClientId?: string | null
}
