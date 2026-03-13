import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'

import { healthApi } from '@/lib/api'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

function getProjectId(): string | undefined {
  const fromExpoConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId
  const fromEasConfig = Constants.easConfig?.projectId
  return fromExpoConfig ?? fromEasConfig
}

export async function registerPushToken(): Promise<string | null> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') return null

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4f46e5',
    })
  }

  const projectId = getProjectId()
  if (!projectId) {
    console.warn('EAS projectId not set; cannot obtain Expo push token')
    return null
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId })
  const token = tokenData.data

  void healthApi.registerPushToken(token).catch(() => {
    // Best-effort registration; retries on next launch.
  })

  return token
}

export function usePushNotificationListener(
  onReceive: (notification: Notifications.Notification) => void,
) {
  return Notifications.addNotificationReceivedListener(onReceive)
}
