import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Setup Wizard | ChorumAI',
  description: 'Configure your ChorumAI instance',
}

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
