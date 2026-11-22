import { LogoAstro } from '@/components/marca/logo-astro'

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <div className="h-1.5 bg-primary" />
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3">
            <LogoAstro ancho={180} prioridad />
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">Universo de Compras</p>
          </div>
          {children}
          <p className="mt-8 text-center text-xs text-muted-foreground">Ecosistema Comercial Digital ASTRO</p>
        </div>
      </main>
    </div>
  )
}
