import { type NextRequest, NextResponse } from 'next/server'
import { buildCsp, createNonce } from '@/lib/csp'
import { updateSession } from '@/lib/supabase/proxy'
import { LAST_TENANT_COOKIE, tenantIdFromPath } from '@/lib/tenant-paths'

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
    result = NextResponse.redirect(new URL('/', request.url))
  }

  if (result !== response) {
    // Keep refreshed or cleared session cookies on redirects.
    response.cookies.getAll().forEach((cookie) => result.cookies.set(cookie))
  }
  // Remember the opened tenant for "/" and old short paths. Convenience only: the value is always
  // checked against the user's own tenants before it is used.
  const tenantId = tenantIdFromPath(pathname)
  if (tenantId && hasSession && request.cookies.get(LAST_TENANT_COOKIE)?.value !== tenantId) {
    result.cookies.set(LAST_TENANT_COOKIE, tenantId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  }
  result.headers.set('Content-Security-Policy', csp)
  return result
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)'],
}
