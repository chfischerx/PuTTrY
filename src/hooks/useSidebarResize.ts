import { useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'

/**
 * Hook for handling sidebar resize drag interactions
 */
export function useSidebarResize(setWidth: Dispatch<SetStateAction<number>>) {
  const isResizingRef = useRef(false)

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    isResizingRef.current = true
    const startX = e.clientX
    const startWidth = (e.target as HTMLElement).parentElement?.clientWidth || 300

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return
      const delta = e.clientX - startX
      const newWidth = Math.max(250, Math.min(600, startWidth + delta))
      setWidth(newWidth)
    }

    const handleMouseUp = () => {
      isResizingRef.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('blur', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('blur', handleMouseUp)
  }

  return { handleMouseDown }
}
