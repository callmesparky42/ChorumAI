import type { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'

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
      async authorize(credentials, req) {
        return {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Dev User',
          email: 'dev@example.com',
        }
      }
    })
  )
}

export const authOptions: NextAuthOptions = {
  providers,
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
      }
      return session
    },
  },
  session: {
    strategy: 'jwt',
  },
}