import { createServerClient } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'
import { sessionCookieOptions } from './cookie-options'
import type { Database } from './database.types'

/**
 * Refreshes the Supabase session cookies for this request.
 * `forward` builds the pass-through response; it is called again after cookies change so the
 * refreshed cookies reach the server components of this request.
 */
export async function updateSession(request: NextRequest, forward: () => NextResponse) {
  let response = forward()

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: sessionCookieOptions(request.nextUrl.protocol === 'https:'),
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = forward()
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
        },
      },
    },
  )

  // Do not run code between createServerClient and getClaims(): it refreshes the session.
  const { data } = await supabase.auth.getClaims()
  return { response, hasSession: Boolean(data?.claims?.sub) }
}
