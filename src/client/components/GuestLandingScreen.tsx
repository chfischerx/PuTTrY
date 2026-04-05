import { useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { WebTerminalLogo } from "./WebTerminalLogo"
import { Button } from "@/components/ui/button"

export function GuestLandingScreen({ token }: { token: string }) {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [errorMessage, setErrorMessage] = useState("")
  const attemptedRef = useRef(false)

  useEffect(() => {
    // Only attempt redemption once
    if (attemptedRef.current) return
    attemptedRef.current = true

    async function redeemToken() {
      try {
        const response = await fetch("/api/guest/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          credentials: "include",
        })

        if (!response.ok) {
          // If the token is already used, check if we have a valid guest session
          if (response.status === 401) {
            const statusRes = await fetch("/api/guest/status", { credentials: "include" })
            const statusData = await statusRes.json()

            if (statusData.valid) {
              // We have a valid guest session, just proceed
              setStatus("success")
              toast.success(`Welcome, ${statusData.name}!`)
              setTimeout(() => { window.location.href = "/" }, 500)
              return
            }
          }

          const error = await response.json().catch(() => ({ error: "Unknown error" }))
          setErrorMessage(error.error || "Failed to redeem guest link")
          setStatus("error")
          return
        }

        const data = await response.json()
        setStatus("success")
        toast.success(`Welcome, ${data.name}!`)
        // Redirect to home after a brief delay
        setTimeout(() => { window.location.href = "/" }, 500)
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Network error")
        setStatus("error")
      }
    }

    redeemToken()
  }, [token])

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center w-full h-screen bg-background text-foreground">
        <div className="text-center">
          <div className="mb-4 inline-block">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
          </div>
          <p className="text-sm text-muted-foreground">Redeeming guest link...</p>
        </div>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center w-full h-screen bg-background text-foreground">
        <div className="w-full max-w-sm px-6 -mt-24">
          <div className="flex flex-col items-center mb-4">
            <WebTerminalLogo />
          </div>

          <div className="rounded-lg border border-border bg-card p-6 space-y-6">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Invalid or already-used token</p>
              <p className="text-sm text-destructive font-medium">{errorMessage}</p>
            </div>
            <Button
              onClick={() => { window.location.href = "/" }}
              variant="default"
              className="w-full"
            >
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return null // Redirecting
}
