import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

import { requireBiometric } from '@/lib/biometric'

interface BiometricGateProps {
  prompt: string
  children: React.ReactNode
  onDenied?: () => void
}

type State = 'checking' | 'granted' | 'denied'

export function BiometricGate({ prompt, children, onDenied }: BiometricGateProps) {
  const [state, setState] = useState<State>('checking')

  useEffect(() => {
    void requireBiometric(prompt).then((ok) => {
      setState(ok ? 'granted' : 'denied')
      if (!ok) onDenied?.()
    })
  }, [prompt, onDenied])

  if (state === 'checking') {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#60a5fa" />
        <Text style={s.text}>Verifying identity...</Text>
      </View>
    )
  }

  if (state === 'denied') {
    return (
      <View style={s.center}>
        <Text style={s.denied}>Authentication required</Text>
        <TouchableOpacity
          style={s.button}
          onPress={() => {
            setState('checking')
            void requireBiometric(prompt).then((ok) => {
              setState(ok ? 'granted' : 'denied')
              if (!ok) onDenied?.()
            })
          }}
        >
          <Text style={s.buttonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return <>{children}</>
}

const s = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
  },
  text: {
    color: '#9ca3af',
    marginTop: 12,
    fontSize: 14,
  },
  denied: {
    color: '#f87171',
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    marginTop: 16,
    backgroundColor: '#1f2937',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#e5e7eb',
    fontWeight: '600',
  },
})
