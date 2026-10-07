import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { sessionCookieOptions } from './cookie-options'
import type { Database } from './database.types'

/** Supabase client bound to the request cookies. Create a new one per request; never share globally. */
export async function createClient() {
  const cookieStore = await cookies()
  // Behind Vercel (or any TLS-terminating proxy) the original scheme arrives in x-forwarded-proto.
  const isHttps = (await headers()).get('x-forwarded-proto') === 'https'
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: sessionCookieOptions(isHttps),
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Safe to ignore: src/proxy.ts refreshes the session on every request.
          }
        },
      },
    },
  )
}
