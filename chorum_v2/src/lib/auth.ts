import type { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import { createHash } from 'crypto'
import { db } from '@/db'
import { sql } from 'drizzle-orm'

/**
 * Convert an OAuth provider + subject to a deterministic UUID v5-style string.
 * This gives every Google user a stable UUID we can use as a DB primary key,
 * regardless of the OAuth provider's own ID format.
 */
function oauthSubToUuid(provider: string, sub: string): string {
  const hash = createHash('sha256').update(`${provider}:${sub}`).digest()
  // Set UUID v5 version bits (0101) in octet 6
  hash[6] = (hash[6]! & 0x0f) | 0x50
  // Set UUID variant bits (10xx) in octet 8
  hash[8] = (hash[8]! & 0x3f) | 0x80
  const h = hash.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

async function ensureAuthUser(id: string, email: string): Promise<void> {
  try {
    await db.execute(
      sql`INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
          VALUES (${id}::uuid, ${email}, '{}', '{}', 'authenticated', 'authenticated', now(), now())
          ON CONFLICT (id) DO NOTHING`
    )
  } catch (e) {
    // Non-fatal: user may already exist or auth schema may be read-only
    console.warn('ensureAuthUser skipped:', e)
  }
}

const providers: any[] = [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID || 'dummy',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy',
  }),
]

if (process.env.NODE_ENV === 'development') {
  providers.push(
    CredentialsProvider({
      name: 'Development Bypass',
      credentials: {},
      async authorize() {
        return {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Dev User',
          email: 'dev@example.com',
        }
      },
    })
  )
}

export const authOptions: NextAuthOptions = {
  providers,
  callbacks: {
    async jwt({ token, account, profile }) {
      // On sign-in, account and profile are present. Map the OAuth sub to
      // a deterministic UUID and persist the user in auth.users.
      if (account && token.sub) {
        const internalId = oauthSubToUuid(account.provider, token.sub)
        const email = (profile as any)?.email ?? token.email ?? ''
        await ensureAuthUser(internalId, email as string)
        token.userId = internalId
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        // Prefer the mapped UUID; fall back to token.sub for dev credentials provider
        session.user.id = (token.userId as string | undefined) ?? token.sub ?? ''
      }
      return session
    },
  },
  session: {
    strategy: 'jwt',
  },
}
