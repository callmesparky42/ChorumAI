import * as Linking from 'expo-linking'
import * as LocalAuthentication from 'expo-local-authentication'
import * as WebBrowser from 'expo-web-browser'

import { API_BASE, clearToken, getStoredToken, storeToken } from '@/lib/api'

WebBrowser.maybeCompleteAuthSession()

/**
 * Check if a bearer token is stored locally.
 * Token validity is enforced by server responses on API calls.
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getStoredToken()
  return token !== null && token.length > 0
}

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

/**
 * Sign in via browser OAuth -> deep-link one-time code -> token exchange.
 */
export async function signIn(): Promise<string | null> {
  const redirectUri = Linking.createURL('auth')
  const result = await WebBrowser.openAuthSessionAsync(
    `${API_BASE}/api/auth/mobile-init`,
    redirectUri,
  )

  if (result.type !== 'success') return null

  const parsed = Linking.parse(result.url)
  const code = parsed.queryParams?.['code']
  if (typeof code !== 'string' || !code) return null

  const token = await exchangeCodeForToken(code)
  if (!token) return null

  await storeToken(token)
  return token
}

/**
 * Revoke current token server-side (best effort), then clear local token.
 */
export async function logout(): Promise<void> {
  const token = await getStoredToken()
  if (token) {
    await fetch(`${API_BASE}/api/auth/mobile-token`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {
      // best-effort revocation; local clear still happens
    })
  }

  await clearToken()
}

export async function biometricAvailable(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync()
  if (!compatible) return false
  const enrolled = await LocalAuthentication.isEnrolledAsync()
  return enrolled
}

/**
 * Prompt biometric re-auth when app returns to foreground.
 */
export async function requireBiometric(): Promise<boolean> {
  const available = await biometricAvailable()
  if (!available) return true

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Verify your identity to continue',
    fallbackLabel: 'Use passcode',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  })

  return result.success
}
