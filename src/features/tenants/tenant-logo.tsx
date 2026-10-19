'use client'

import { useState } from 'react'
import { useTenant } from './tenant-context'

/**
 * The current business's logo, small, next to its name in the business switcher. Fixed height on a white
 * tile, so wide letterhead logos, square marks and JPEGs with a white background all sit the same way.
 * Decorative (alt=""): the name next to it says the same. Nothing is shown without a logo or if it fails to load.
 * The name has priority: narrow beside it on phones, hidden below 22rem; in the sidebar the logo sits above the name.
 */
export function TenantLogo() {
  const { logoVersion, api } = useTenant()
  // Remembers which version failed, so a new upload gets a fresh attempt.
  const [failed, setFailed] = useState<string | null>(null)
  if (!logoVersion || failed === logoVersion) return null
  return (
    // Outer span: in the sidebar it fills a whole row of the wrapping switcher (basis-full), the tile keeps its size.
    <span className="hidden shrink-0 min-[22rem]:block md:basis-full">
      <span className="flex h-8 max-w-14 items-center rounded-md bg-card p-1 ring-1 ring-border md:h-10 md:w-fit md:max-w-full">
        {/* Private image from this origin (no-store); next/image would add nothing here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${api('settings/logo')}?v=${encodeURIComponent(logoVersion)}`}
          alt=""
          className="h-full w-auto max-w-full object-contain"
          onError={() => setFailed(logoVersion)}
        />
      </span>
    </span>
  )
}
