'use client'

import { Component, type ReactNode } from 'react'
import { HyggeButton } from '@/components/hygge'

interface Props {
    children: ReactNode
    fallback?: ReactNode
}

interface State {
    hasError: boolean
    error: Error | null
}

export class ShellErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    override componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[Shell] Uncaught error:', error, info.componentStack)
    }

    override render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback

            return (
                <div className="flex items-center justify-center h-full p-8">
                    <div className="max-w-md text-center space-y-4">
                        <div className="text-4xl">⚡</div>
                        <h2 className="text-lg font-medium text-[var(--hg-text-primary)]">
                            Something went wrong
                        </h2>
                        <p className="text-sm text-[var(--hg-text-secondary)]">
                            {this.state.error?.message || 'An unexpected error occurred.'}
                        </p>
                        <HyggeButton
                            variant="accent"
                            onClick={() => this.setState({ hasError: false, error: null })}
                        >
                            Try again
                        </HyggeButton>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}
