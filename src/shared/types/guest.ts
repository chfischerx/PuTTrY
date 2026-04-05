export interface GuestLink {
  id: string
  name: string
  createdAt: number
  status: "used" | "unused"
  activeSessions: number
  sessionIds: string[]
}
