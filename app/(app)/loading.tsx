/**
 * Esqueleto que se muestra al instante al cambiar de módulo, mientras el
 * servidor prepara la página. El menú lateral (layout) no se vuelve a
 * pintar. Además permite que Next precargue cada módulo hasta este punto.
 */
export default function Cargando() {
  return (
    <main className="mx-auto flex w-full max-w-5xl animate-pulse flex-col gap-6 px-4 py-8 md:px-6" aria-busy="true" aria-label="Cargando">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-48 rounded-md bg-secondary" />
        <div className="h-4 w-72 max-w-full rounded-md bg-secondary/70" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-secondary/70" />
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-secondary/60" />
        ))}
      </div>
    </main>
  )
}
