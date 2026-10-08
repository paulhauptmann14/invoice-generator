'use client'

import { setNonce } from 'get-nonce'
import { createNonceKeeper } from './csp-nonce-keeper'

// One keeper per page load (module state in the browser); the first render carries the document's nonce.
const keepNonce = createNonceKeeper(setNonce)

/**
 * Hands the CSP nonce of the loaded document to libraries that inject <style> elements at runtime
 * (react-remove-scroll in Radix dialogs). Without it, the strict style-src policy blocks them.
 */
export function CspNonce({ nonce }: { nonce: string }) {
  // Browser only: the server must not keep a nonce across requests.
  if (typeof window !== 'undefined') keepNonce(nonce)
  return null
}
