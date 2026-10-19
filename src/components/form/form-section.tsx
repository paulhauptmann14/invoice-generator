/**
 * One group of a form ("inset grouped"): the heading sits on the page, the fields on a white surface
 * below it. Proximity does the grouping, no rules or frames needed.
 */
export function FormSection({
  title,
  description,
  className,
  children,
}: {
  title: string
  description?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <fieldset className={['min-w-0', className].filter(Boolean).join(' ')}>
      <legend className="type-title px-1">{title}</legend>
      {description && <div className="mt-1 px-1 text-sm text-muted-foreground">{description}</div>}
      <div className="surface mt-3 space-y-5 p-4 sm:p-6">{children}</div>
    </fieldset>
  )
}
