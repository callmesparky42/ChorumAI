import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/lib/db"

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: DrizzleAdapter(db),
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
    ],
    session: {
        strategy: "jwt",
    },
    callbacks: {
        async jwt({ token, user }) {
            // On initial sign in, add user.id to token
            if (user) {
                token.id = user.id
            }
            return token
        },
        async session({ session, token }) {
            // Add user.id to session so we can use it in API routes
            if (session.user && token.id) {
                session.user.id = token.id as string
            }
            return session
        },
    },
    pages: {
        signIn: '/login',
    },
})
