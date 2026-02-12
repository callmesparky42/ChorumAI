import clsx from 'clsx'

export function HyggeCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('bg-[var(--hg-surface)] border border-[var(--hg-border)] p-4', className)}>
      {children}
    </div>
  )
}
