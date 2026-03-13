import React, { useCallback, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Send } from 'lucide-react-native'

import { healthApi } from '@/lib/api'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export default function ChatTab() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hello. I am your Health Monitor. Ask about trends, labs, vitals, or checkups.',
    },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<FlatList>(null)

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    const userId = `${Date.now()}`
    const assistantId = `${Date.now()}-assistant`
    const userMessage: Message = { id: userId, role: 'user', content: text }
    const assistantMessage: Message = { id: assistantId, role: 'assistant', content: '' }

    setMessages((prev) => [...prev, userMessage, assistantMessage])
    setInput('')
    setSending(true)

    try {
      for await (const delta of healthApi.streamChat(text)) {
        setMessages((prev) => prev.map((message) =>
          message.id === assistantId
            ? { ...message, content: message.content + delta }
            : message
        ))
      }
    } catch (err) {
      setMessages((prev) => prev.map((message) =>
        message.id === assistantId
          ? {
            ...message,
            content: err instanceof Error
              ? err.message
              : 'Sorry, I could not process that. Please try again.',
          }
          : message
      ))
    } finally {
      setSending(false)
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }, [input, sending])

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        style={s.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={s.heading}>Health Chat</Text>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => (
            <View style={[s.bubble, item.role === 'user' ? s.userBubble : s.assistantBubble]}>
              <Text style={s.bubbleText}>{item.content}</Text>
            </View>
          )}
        />

        <View style={s.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your health data..."
            placeholderTextColor="#6b7280"
            style={s.input}
            multiline
          />
          <TouchableOpacity
            style={[s.sendButton, sending ? s.sendButtonDisabled : null]}
            onPress={send}
            disabled={sending}
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Send size={18} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  heading: {
    color: '#f9fafb',
    fontSize: 22,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  bubble: {
    maxWidth: '86%',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  userBubble: {
    backgroundColor: '#2563eb',
    alignSelf: 'flex-end',
  },
  assistantBubble: {
    backgroundColor: '#111827',
    alignSelf: 'flex-start',
  },
  bubbleText: {
    color: '#e5e7eb',
    fontSize: 14,
    lineHeight: 20,
  },
  inputRow: {
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#111827',
    color: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 120,
  },
  sendButton: {
    backgroundColor: '#2563eb',
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.7,
  },
})
