'use client'
import clsx from 'clsx'

export function HyggeToggle({ checked, onChange, label, description }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--hg-border)]">
      <div className="flex-1 pr-8">
        <span className="text-sm text-[var(--hg-text-primary)]">{label}</span>
        {description && <p className="text-xs text-[var(--hg-text-tertiary)] mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={clsx(
          "w-10 h-5 rounded-full transition-colors relative",
          checked ? "bg-[var(--hg-accent)]" : "bg-[var(--hg-border-subtle)]"
        )}
      >
        <span className={clsx(
          "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all",
          checked ? "left-[22px]" : "left-0.5"
        )} />
      </button>
    </div>
  )
}
