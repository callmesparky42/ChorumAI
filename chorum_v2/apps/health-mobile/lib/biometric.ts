import * as LocalAuthentication from 'expo-local-authentication'

export interface BiometricCheckResult {
  available: boolean
  type: 'fingerprint' | 'facial' | 'iris' | 'none'
}

export async function getBiometricInfo(): Promise<BiometricCheckResult> {
  const available = await LocalAuthentication.hasHardwareAsync()
  if (!available) return { available: false, type: 'none' }

  const enrolled = await LocalAuthentication.isEnrolledAsync()
  if (!enrolled) return { available: false, type: 'none' }

  const types = await LocalAuthentication.supportedAuthenticationTypesAsync()
  const type: BiometricCheckResult['type'] =
    types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) ? 'facial' :
      types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT) ? 'fingerprint' :
        types.includes(LocalAuthentication.AuthenticationType.IRIS) ? 'iris' :
          'none'

  return { available: true, type }
}

export async function requireBiometric(promptMessage: string): Promise<boolean> {
  const { available } = await getBiometricInfo()
  if (!available) return true

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    })
    return result.success
  } catch {
    return false
  }
}
