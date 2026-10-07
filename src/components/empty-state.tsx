export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mt-8 rounded-md border border-dashed border-border bg-card px-6 py-10">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 max-w-prose text-sm text-muted-foreground">{children}</div>}
    </div>
  )
}
