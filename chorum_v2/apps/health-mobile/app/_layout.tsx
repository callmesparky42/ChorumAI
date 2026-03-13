import { useEffect, useRef, useState } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as Linking from 'expo-linking'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import { API_BASE, storeToken } from '@/lib/api'
import { isAuthenticated } from '@/lib/auth'
import { registerPushToken } from '@/lib/push'

async function exchangeCodeForToken(code: string): Promise<string | null> {
  const resp = await fetch(`${API_BASE}/api/auth/mobile-exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (!resp.ok) return null
  const body = await resp.json() as { token?: string }
  return typeof body.token === 'string' && body.token ? body.token : null
}

export default function RootLayout() {
  const router = useRouter()
  const segments = useSegments()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const pushRegistered = useRef(false)

  useEffect(() => {
    isAuthenticated().then(setAuthed)
  }, [])

  useEffect(() => {
    if (authed === null) return

    const inTabs = segments[0] === '(tabs)'
    if (!authed && inTabs) {
      router.replace('/login')
    } else if (authed && !inTabs) {
      router.replace('/(tabs)/dashboard')
    }
  }, [authed, segments, router])

  useEffect(() => {
    const handleUrl = async (event: { url: string }) => {
      const parsed = Linking.parse(event.url)
      if (parsed.path !== 'auth') return

      const code = parsed.queryParams?.['code']
      if (typeof code !== 'string' || !code) return

      const token = await exchangeCodeForToken(code)
      if (!token) return

      await storeToken(token)
      setAuthed(true)
      router.replace('/(tabs)/dashboard')
    }

    const sub = Linking.addEventListener('url', handleUrl)
    Linking.getInitialURL().then((url) => {
      if (url) void handleUrl({ url })
    })

    return () => sub.remove()
  }, [router])

  useEffect(() => {
    if (!authed || pushRegistered.current) return
    pushRegistered.current = true
    void registerPushToken().catch(() => {
      pushRegistered.current = false
    })
  }, [authed])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </GestureHandlerRootView>
  )
}
