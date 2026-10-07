/** First focusable element in the app shell: lets keyboard users jump past the navigation. */
export function SkipLink() {
  return (
    <a
      href="#inhalt"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-3 focus:text-sm focus:font-medium"
    >
      Zum Inhalt springen
    </a>
  )
}
