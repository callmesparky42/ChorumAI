import React, { useMemo, useState } from 'react'
import {
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

interface TiffViewerProps {
  pngPaths: string[]
  title?: string
}

const { width } = Dimensions.get('window')

function encodeStoragePath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/')
}

function toImageUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path

  const baseUrl = process.env.EXPO_PUBLIC_HEALTH_SUPABASE_URL ?? ''
  if (!baseUrl) return path
  const encodedPath = encodeStoragePath(path)
  return `${baseUrl}/storage/v1/object/public/health-uploads/${encodedPath}`
}

export function TiffViewer({ pngPaths, title }: TiffViewerProps) {
  const [currentPage, setCurrentPage] = useState(0)
  const urls = useMemo(() => pngPaths.map(toImageUrl), [pngPaths])

  if (urls.length === 0) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyText}>No pages available</Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      {title ? <Text style={s.title}>{title}</Text> : null}
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          const page = Math.round(event.nativeEvent.contentOffset.x / width)
          setCurrentPage(page)
        }}
      >
        {urls.map((url, index) => (
          <Image
            key={`${url}-${index}`}
            source={{ uri: url }}
            style={s.pageImage}
            resizeMode="contain"
          />
        ))}
      </ScrollView>
      <Text style={s.pageIndicator}>
        Page {currentPage + 1} of {urls.length}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  empty: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  title: {
    color: '#e5e7eb',
    fontSize: 16,
    fontWeight: '600',
    padding: 16,
  },
  pageImage: {
    width,
    height: width * 1.4,
  },
  pageIndicator: {
    color: '#6b7280',
    textAlign: 'center',
    padding: 8,
    fontSize: 13,
  },
})
