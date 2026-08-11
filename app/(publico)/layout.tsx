import { Gem } from 'lucide-react'

export default function PublicoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-20">
        <div className="flex h-16 items-center gap-2 border-b border-border bg-card/90 px-4 backdrop-blur md:px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-deeper text-brand-deeper-foreground">
            <Gem className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div className="leading-tight">
            <span className="block text-base font-bold tracking-tight text-foreground">ASTRO</span>
            <span className="block text-[11px] font-medium text-muted-foreground">Joyería</span>
          </div>
        </div>
        <div className="h-1.5 bg-brand-deeper" />
      </header>
      <div className="flex-1">{children}</div>
    </div>
  )
}
