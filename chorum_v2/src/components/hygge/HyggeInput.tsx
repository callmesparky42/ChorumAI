'use client'
import clsx from 'clsx'

interface HyggeInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string
}

export function HyggeInput({ label, className, ...props }: HyggeInputProps) {
    return (
        <div>
            {label && <label className="block text-xs text-[var(--hg-text-secondary)] mb-1">{label}</label>}
            <input
                className={clsx(
                    'w-full bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-2 text-sm',
                    'text-[var(--hg-text-primary)] placeholder:text-[var(--hg-text-tertiary)]',
                    'focus:outline-none focus:border-[var(--hg-accent)]',
                    className,
                )}
                {...props}
            />
        </div>
    )
}

export function HyggeTextarea({ label, className, ...props }: {
    label?: string; className?: string
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <div>
            {label && <label className="block text-xs text-[var(--hg-text-secondary)] mb-1">{label}</label>}
            <textarea
                className={clsx(
                    'w-full bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-2 text-sm',
                    'text-[var(--hg-text-primary)] placeholder:text-[var(--hg-text-tertiary)]',
                    'focus:outline-none focus:border-[var(--hg-accent)] resize-y min-h-[80px]',
                    className,
                )}
                {...props}
            />
        </div>
    )
}
