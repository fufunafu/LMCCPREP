export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>{eyebrow && <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">{eyebrow}</p>}<h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}</div>
      {action}
    </div>
  );
}
