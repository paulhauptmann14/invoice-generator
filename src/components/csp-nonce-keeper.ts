/**
 * Applies only the first nonce it is given. A page's Content Security Policy is fixed when the document loads;
 * later server renders (router.refresh, server action redirects) carry a fresh nonce that this document's
 * policy does not allow, so switching to it would get runtime <style> elements blocked.
 */
export function createNonceKeeper(set: (nonce: string) => void) {
  let applied = false
  return (nonce: string) => {
    if (applied || nonce === '') return
    set(nonce)
    applied = true
  }
}
