'use client'

import { setNonce } from 'get-nonce'

/**
 * Hands the per-request CSP nonce to libraries that inject <style> elements at runtime
 * (react-remove-scroll in Radix dialogs). Without it, the strict style-src policy blocks them.
 */
export function CspNonce({ nonce }: { nonce: string }) {
  setNonce(nonce)
  return null
}
