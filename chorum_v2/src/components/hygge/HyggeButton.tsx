'use client'
import clsx from 'clsx'

interface HyggeButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'accent' | 'destructive' | 'outline' | 'icon'
    loading?: boolean
}

export function HyggeButton({
    variant = 'default', loading, children, className, disabled, ...props
}: HyggeButtonProps) {
    return (
        <button
            className={clsx(
                'hg-btn',
                variant === 'accent' && 'hg-btn-accent',
                variant === 'destructive' && 'hg-btn-destructive',
                variant === 'outline' && 'hg-btn-outline',
                variant === 'icon' && 'hg-btn-icon',
                className,
            )}
            disabled={disabled || loading}
            {...props}
        >
            {loading && <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />}
            {children}
        </button>
    )
}
