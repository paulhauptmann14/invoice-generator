import { expect, test, vi } from 'vitest'
import { createNonceKeeper } from './csp-nonce-keeper'

test('keeps the first nonce of the page; later server renders do not replace it', () => {
  const set = vi.fn()
  const keep = createNonceKeeper(set)
  keep('nonce-of-the-document')
  keep('nonce-of-a-router-refresh')
  keep('nonce-of-a-router-refresh')
  expect(set).toHaveBeenCalledTimes(1)
  expect(set).toHaveBeenCalledWith('nonce-of-the-document')
})
test('an empty nonce is ignored (and does not block the real one)', () => {
  const set = vi.fn()
  const keep = createNonceKeeper(set)
  keep('')
  keep('abc')
  expect(set).toHaveBeenCalledWith('abc')
  expect(set).toHaveBeenCalledTimes(1)
})
