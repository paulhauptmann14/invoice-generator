'use client'

import { ErrorPanel } from '@/components/error-panel'

/** Error inside a business's app shell: navigation stays usable around the message. */
export default function TenantError({ retry }: { retry: () => void }) {
  return <ErrorPanel retry={retry} />
}
