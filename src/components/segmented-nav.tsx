import { GuardedLink } from '@/components/unsaved-changes'

export type Segment = { href: string; label: string; active: boolean }

/**
 * Segmented control for switching between views of one page (each segment is a link). The chosen
 * segment is a raised white thumb with heavier text; aria-current carries the state for screen readers.
 * Narrow screens: full width, two segments per row (all stay visible, nothing scrolls).
 */
export function SegmentedNav({ label, segments, className }: { label: string; segments: Segment[]; className?: string }) {
  return (
    <nav aria-label={label} className={className}>
      <ul className="grid w-full grid-cols-2 gap-0.5 rounded-lg bg-(--segment-track) p-0.5 sm:inline-flex sm:w-auto">
        {segments.map(({ href, label: text, active }) => (
          <li key={href}>
            <GuardedLink
              href={href}
              aria-current={active ? 'page' : undefined}
              className={[
                'flex min-h-11 items-center justify-center rounded-md px-3.5 text-sm whitespace-nowrap transition-colors duration-(--duration-fast) md:min-h-9',
                active
                  ? 'bg-card font-semibold text-foreground shadow-(--elev-raised)'
                  : 'text-muted-foreground hover:text-foreground active:bg-pressed/60 active:duration-0',
              ].join(' ')}
            >
              {text}
            </GuardedLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
