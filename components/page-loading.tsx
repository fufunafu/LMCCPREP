export function PageLoading({ questions = false }: { questions?: boolean }) {
  return (
    <div role="status" aria-label={questions ? "Loading questions" : "Loading page"} className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <span className="sr-only">{questions ? "Loading questions…" : "Loading page…"}</span>
      <div aria-hidden="true" className="space-y-5 motion-safe:animate-pulse">
        <div className="h-4 w-28 rounded bg-muted" />
        <div className="h-9 w-64 max-w-full rounded bg-muted" />
        <div className="h-4 w-96 max-w-full rounded bg-muted" />
        <div className="h-28 rounded-2xl border bg-muted/50" />
        <div className={questions ? "space-y-3" : "grid gap-4 sm:grid-cols-2"}>
          {Array.from({ length: questions ? 4 : 6 }, (_, index) => <div key={index} className="h-36 rounded-2xl border bg-muted/40" />)}
        </div>
      </div>
    </div>
  );
}
