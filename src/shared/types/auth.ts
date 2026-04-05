export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated' | 'totp-setup' | 'totp-verify' | 'passkey-verify'

export interface AuthState {
  authenticated: boolean
  authDisabled: boolean
  showAuthDisabledWarning?: boolean
  passkeyLoginAvailable?: boolean
  isGuest?: boolean
  requiresTOTP?: boolean
  requiresPasskey?: boolean
  canChoose?: boolean
  totpMode?: 'setup' | 'verify'
}
