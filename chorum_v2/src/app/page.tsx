import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { LandingClient } from '@/components/shell/LandingClient'
import './landing.css'

export default async function Page() {
    const session = await getServerSession(authOptions)
    if (session?.user?.id) redirect('/chat')
    return <LandingClient />
}
