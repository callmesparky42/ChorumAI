'use client'

import { createClient } from '@/lib/supabase-client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'

export default function LoginPage() {
    const router = useRouter()
    const supabase = createClient()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isSignUp, setIsSignUp] = useState(false)
    const [message, setMessage] = useState<string | null>(null)

    // Check for OAuth errors in URL
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const errorParam = params.get('error')
        if (errorParam) {
            setError(decodeURIComponent(errorParam))
        }
    }, [])

    const handleGoogleLogin = async () => {
        setLoading(true)
        setError(null)
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${location.origin}/auth/callback`,
            },
        })
        if (error) {
            setError(error.message)
            setLoading(false)
        }
    }

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        setMessage(null)

        try {
            if (isSignUp) {
                const { error, data } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: `${location.origin}/auth/callback`,
                    },
                })
                if (error) throw error
                // Check if email confirmation is required
                if (data?.user && !data.session) {
                    setMessage('Check your email for the confirmation link.')
                } else if (data?.session) {
                    // Initialize user record in database
                    await fetch('/api/auth/init-user', { method: 'POST' })

                    // Log the signup
                    await fetch('/api/auth/log', {
                        method: 'POST',
                        body: JSON.stringify({ provider: 'email', method: 'signup' })
                    })
                    router.push('/app')
                }
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                })
                if (error) throw error

                // Initialize user record if it doesn't exist (for existing accounts)
                await fetch('/api/auth/init-user', { method: 'POST' })

                // Log the login
                await fetch('/api/auth/log', {
                    method: 'POST',
                    body: JSON.stringify({ provider: 'email', method: 'password' })
                })
                router.push('/app')
            }
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <img src="/logo.png" alt="Chorum AI" className="h-24 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-white">Welcome to Chorum AI</h1>
                    <p className="text-gray-400 mt-2">Your sovereign LLM Router</p>
                </div>

                {/* Login Card */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
                    <h2 className="text-lg font-medium text-white mb-6 text-center">
                        {isSignUp ? 'Create an account' : 'Sign in to continue'}
                    </h2>

                    {error && (
                        <div className="bg-red-900/50 border border-red-800 text-red-200 p-3 rounded-lg flex items-center gap-2 mb-4 text-sm">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    {message && (
                        <div className="bg-green-900/50 border border-green-800 text-green-200 p-3 rounded-lg flex items-center gap-2 mb-4 text-sm">
                            <AlertCircle className="w-4 h-4" />
                            {message}
                        </div>
                    )}

                    <div className="space-y-4">
                        <button
                            onClick={handleGoogleLogin}
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-900 font-medium py-3 px-4 rounded-xl transition-colors disabled:opacity-50"
                        >
                            {loading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                    </svg>
                                    Continue with Google
                                </>
                            )}
                        </button>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-800"></div>
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-gray-900 text-gray-500">Or continue with email</span>
                            </div>
                        </div>

                        <form onSubmit={handleEmailAuth} className="space-y-3">
                            <div>
                                <input
                                    type="email"
                                    placeholder="Email address"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-colors"
                                />
                            </div>
                            <div>
                                <input
                                    type="password"
                                    placeholder="Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-colors"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-gray-800 hover:bg-gray-700 text-white font-medium py-3 px-4 rounded-xl transition-colors disabled:opacity-50"
                            >
                                {loading ? (
                                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                                ) : (
                                    isSignUp ? 'Sign Up' : 'Sign In'
                                )}
                            </button>
                        </form>
                    </div>

                    <div className="mt-6 text-center text-sm text-gray-500">
                        {isSignUp ? (
                            <p>
                                Already have an account?{' '}
                                <button onClick={() => setIsSignUp(false)} className="text-blue-400 hover:underline">
                                    Sign in
                                </button>
                            </p>
                        ) : (
                            <p>
                                Don't have an account?{' '}
                                <button onClick={() => setIsSignUp(true)} className="text-blue-400 hover:underline">
                                    Sign up
                                </button>
                            </p>
                        )}
                    </div>
                </div>

                <div className="text-center text-gray-600 text-xs mt-6">
                    <p>After signing in, you'll configure your AI provider API keys in Settings.</p>
                </div>
            </div>
        </div>
    )
}
