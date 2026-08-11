import { Gem } from 'lucide-react'

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <div className="h-1.5 bg-brand-deeper" />
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-deeper text-brand-deeper-foreground">
              <Gem className="h-7 w-7" strokeWidth={1.8} />
            </div>
            <div className="text-center leading-tight">
              <p className="text-2xl font-bold tracking-tight text-foreground">ASTRO</p>
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
                Joyería
              </p>
            </div>
          </div>
          {children}
          <p className="mt-8 text-center text-xs text-muted-foreground">
            Ecosistema Comercial Digital ASTRO
          </p>
        </div>
      </main>
    </div>
  )
}
