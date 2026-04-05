import React from 'react'

/**
 * SettingRow - displays a label/description with a control element
 */
export const SettingRow = ({
  label,
  description,
  children,
  note,
}: {
  label: string
  description?: string
  children: React.ReactNode
  note?: string
}) => (
  <div className="flex flex-col max-sm:gap-2 sm:items-start sm:justify-between sm:gap-4 py-3 max-sm:py-2 px-3 max-sm:px-2 border-b border-border/50 last:border-b-0 sm:flex-row sm:py-4 sm:px-4">
    <div className="flex-1 min-w-0">
      <label className="text-sm font-medium block text-foreground">{label}</label>
      {description && <p className="text-xs text-muted-foreground mt-1 break-words">{description}</p>}
    </div>
    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
      {children}
      {note && (
        <div className="text-xs text-muted-foreground italic ml-2">
          ℹ️ {note}
        </div>
      )}
    </div>
  </div>
)

/**
 * SettingSection - displays a group of settings with a title
 */
export const SettingSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-6 max-sm:mb-5">
    <h3 className="text-base font-bold mb-2 max-sm:mb-2 text-foreground uppercase tracking-tight text-xs max-sm:text-xs sm:text-base">{title}</h3>
    <div className="rounded-lg border border-border bg-card divide-y divide-border">
      {children}
    </div>
  </div>
)
