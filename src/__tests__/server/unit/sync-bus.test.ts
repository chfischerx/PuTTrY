import { describe, it, expect, beforeEach, vi } from "vitest"
import { addSyncClient, broadcastSync, type SyncEvent } from "../../../server/sessions/sync-bus"

describe("sync-bus", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("addSyncClient", () => {
    it("should add a client to the sync bus", () => {
      const mockWs = {
        readyState: 1, // OPEN
        send: vi.fn(),
        on: vi.fn(),
      } as any

      addSyncClient(mockWs)

      // Should have registered event listeners
      expect(mockWs.on).toHaveBeenCalledWith("close", expect.any(Function))
      expect(mockWs.on).toHaveBeenCalledWith("error", expect.any(Function))
    })

    it("should remove client on close", () => {
      const mockWs = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn(),
      } as any

      addSyncClient(mockWs)

      // Get the close listener
      const closeListener = mockWs.on.mock.calls.find((call: any) => call[0] === "close")?.[1]
      expect(closeListener).toBeDefined()

      // Simulate close
      closeListener()

      // Broadcast should not send to closed client
      const event: SyncEvent = { type: "data-activity", sessionId: "s1" }
      broadcastSync(event)

      expect(mockWs.send).not.toHaveBeenCalled()
    })

    it("should remove client on error", () => {
      const mockWs = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn(),
      } as any

      addSyncClient(mockWs)

      // Get the error listener
      const errorListener = mockWs.on.mock.calls.find((call: any) => call[0] === "error")?.[1]
      expect(errorListener).toBeDefined()

      // Simulate error
      errorListener()

      // Broadcast should not send to errored client
      const event: SyncEvent = { type: "data-activity", sessionId: "s1" }
      broadcastSync(event)

      expect(mockWs.send).not.toHaveBeenCalled()
    })
  })

  describe("broadcastSync", () => {
    it("should send event to open clients", () => {
      const mockWs = {
        readyState: 1, // WebSocket.OPEN
        send: vi.fn(),
        on: vi.fn(),
      } as any

      addSyncClient(mockWs)

      const event: SyncEvent = {
        type: "session-created",
        session: { id: "s1", label: "bash", createdAt: new Date(), cols: 80, rows: 24 },
      }

      broadcastSync(event)

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify(event))
    })

    it("should not send to closed clients", () => {
      const mockWs = {
        readyState: 3, // WebSocket.CLOSED
        send: vi.fn(),
        on: vi.fn(),
      } as any

      addSyncClient(mockWs)

      const event: SyncEvent = { type: "data-activity", sessionId: "s1" }
      broadcastSync(event)

      expect(mockWs.send).not.toHaveBeenCalled()
    })

    it("should send to multiple clients", () => {
      const mockWs1 = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn(),
      } as any
      const mockWs2 = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn(),
      } as any

      addSyncClient(mockWs1)
      addSyncClient(mockWs2)

      const event: SyncEvent = { type: "data-activity", sessionId: "s1" }
      broadcastSync(event)

      expect(mockWs1.send).toHaveBeenCalledWith(JSON.stringify(event))
      expect(mockWs2.send).toHaveBeenCalledWith(JSON.stringify(event))
    })

    it("should JSON serialize the event", () => {
      const mockWs = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn(),
      } as any

      addSyncClient(mockWs)

      const event: SyncEvent = {
        type: "session-renamed",
        sessionId: "s1",
        label: "New Name",
      }

      broadcastSync(event)

      expect(mockWs.send).toHaveBeenCalledWith('{"type":"session-renamed","sessionId":"s1","label":"New Name"}')
    })

    it("should handle session-deleted events", () => {
      const mockWs = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn(),
      } as any

      addSyncClient(mockWs)

      const event: SyncEvent = { type: "session-deleted", sessionId: "s1" }
      broadcastSync(event)

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify(event))
    })

    it("should handle input-lock-acquired events", () => {
      const mockWs = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn(),
      } as any

      addSyncClient(mockWs)

      const event: SyncEvent = {
        type: "input-lock-acquired",
        sessionId: "s1",
        clientId: "client1",
      }
      broadcastSync(event)

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify(event))
    })

    it("should handle input-lock-released events", () => {
      const mockWs = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn(),
      } as any

      addSyncClient(mockWs)

      const event: SyncEvent = {
        type: "input-lock-released",
        sessionId: "s1",
      }
      broadcastSync(event)

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify(event))
    })
  })
})
