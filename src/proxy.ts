import { type NextRequest, NextResponse } from 'next/server'
import { buildCsp, createNonce } from '@/lib/csp'
import { updateSession } from '@/lib/supabase/proxy'

// Convenience layer only (session refresh, redirects, CSP). It is NOT a security boundary:
// every server action and route handler checks membership itself.
export async function proxy(request: NextRequest) {
  const nonce = createNonce()
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === 'development',
    isHttps: request.nextUrl.protocol === 'https:',
  })

  const forward = () => {
    const headers = new Headers(request.headers)
    headers.set('x-nonce', nonce)
    headers.set('Content-Security-Policy', csp)
    return NextResponse.next({ request: { headers } })
  }

  const { response, hasSession } = await updateSession(request, forward)
  const { pathname } = request.nextUrl
  const isLogin = pathname === '/login'

  let result: NextResponse = response
  if (!hasSession && !isLogin) {
    result = pathname.startsWith('/api/')
      ? NextResponse.json({ error: 'unauthorized' }, { status: 401 })
      : NextResponse.redirect(new URL('/login', request.url))
  } else if (hasSession && isLogin) {
    result = NextResponse.redirect(new URL('/rechnungen', request.url))
  }

  if (result !== response) {
    // Keep refreshed or cleared session cookies on redirects.
    response.cookies.getAll().forEach((cookie) => result.cookies.set(cookie))
  }
  result.headers.set('Content-Security-Policy', csp)
  return result
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)'],
}
