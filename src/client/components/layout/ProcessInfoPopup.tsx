interface ProcessInfoPopupProps {
  showProcessInfo: boolean
  setShowProcessInfo: (show: boolean) => void
  processInfo: {
    pid: number
    memory: string
    cpu: number
    uptime: string
    startedAt: string
  } | null
}

export function ProcessInfoPopup(props: ProcessInfoPopupProps) {
  const { showProcessInfo, setShowProcessInfo, processInfo } = props

  if (!showProcessInfo || !processInfo) {
    return null
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setShowProcessInfo(false)} />
      <div className="fixed top-16 right-4 z-50 bg-card border border-border rounded-lg shadow-lg w-80 max-sm:w-[calc(100%-2rem)]" onClick={(e) => e.stopPropagation()}>
        <div className="p-3 space-y-2">
          <div className="flex justify-between items-center pb-2 border-b border-border/50">
            <span className="text-xs font-medium font-mono text-muted-foreground">PID</span>
            <span className="text-xs font-mono font-bold">{processInfo.pid}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium font-mono text-muted-foreground">Memory</span>
            <span className="text-xs font-mono font-bold">{processInfo.memory}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium font-mono text-muted-foreground">CPU</span>
            <span className="text-xs font-mono font-bold">{processInfo.cpu.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium font-mono text-muted-foreground">Uptime</span>
            <span className="text-xs font-mono font-bold">{processInfo.uptime}</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-border/50">
            <span className="text-xs font-medium font-mono text-muted-foreground">Started</span>
            <span className="text-xs font-mono font-bold text-right">{new Date(processInfo.startedAt).toLocaleString()}</span>
          </div>
        </div>
      </div>
    </>
  )
}
