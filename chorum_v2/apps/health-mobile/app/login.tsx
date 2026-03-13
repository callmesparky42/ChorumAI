import { useState } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'

import { signIn } from '@/lib/auth'

export default function LoginScreen() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignIn() {
    setLoading(true)
    setError(null)

    try {
      const token = await signIn()
      if (token) {
        router.replace('/(tabs)/dashboard')
      } else {
        setError('Sign-in was cancelled. Try again.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>Chorum</Text>
        <Text style={styles.subtitle}>Health Monitor</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.tagline}>AI that learns{'\n'}what works.</Text>
        <Text style={styles.description}>
          Your health data, analyzed by AI that understands your patterns.
        </Text>
      </View>

      <View style={styles.footer}>
        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.signInButton, loading && styles.signInButtonDisabled]}
          onPress={handleSignIn}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#0a0a0a" />
            : <Text style={styles.signInText}>Continue with Google</Text>}
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Your health data is encrypted and never sold.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', padding: 24 },
  header: { marginTop: 80 },
  logo: { fontSize: 32, fontWeight: '700', color: '#ffffff', letterSpacing: -1 },
  subtitle: {
    fontSize: 14,
    color: '#888888',
    marginTop: 4,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  body: { flex: 1, justifyContent: 'center' },
  tagline: { fontSize: 40, fontWeight: '700', color: '#ffffff', lineHeight: 48, letterSpacing: -1 },
  description: { fontSize: 16, color: '#888888', marginTop: 16, lineHeight: 24 },
  footer: { paddingBottom: 40 },
  error: { color: '#ff4444', marginBottom: 16, fontSize: 14 },
  signInButton: { backgroundColor: '#e0c060', padding: 18, alignItems: 'center' },
  signInButtonDisabled: { opacity: 0.5 },
  signInText: { color: '#0a0a0a', fontWeight: '700', fontSize: 16 },
  disclaimer: { color: '#555555', fontSize: 12, textAlign: 'center', marginTop: 16 },
})
