'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Gem, Menu, X, LogOut, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { cerrarSesion } from '@/app/(auth)/acciones'
import { seccionesParaRol, nombresRol } from '@/lib/navegacion'
import type { Rol } from '@/lib/usuario'

export function AppShell({
  usuario,
  permisosExtra = [],
  permisosRevocados = [],
  children,
}: {
  usuario: { nombre: string; rol: Rol }
  permisosExtra?: string[]
  permisosRevocados?: string[]
  children: React.ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const pathname = usePathname()

  const seccionesVisibles = useMemo(
    () => seccionesParaRol(usuario.rol, permisosExtra, permisosRevocados),
    [usuario.rol, permisosExtra, permisosRevocados],
  )

  const consulta = busqueda.trim().toLowerCase()
  const seccionesFiltradas = consulta
    ? seccionesVisibles
        .map((s) => ({
          ...s,
          items: s.items.filter(
            (i) =>
              i.etiqueta.toLowerCase().includes(consulta) ||
              i.descripcion.toLowerCase().includes(consulta),
          ),
        }))
        .filter((s) => s.items.length > 0)
    : seccionesVisibles

  const iniciales = usuario.nombre
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {/* Fondo del menú lateral */}
      <div
        onClick={() => setAbierto(false)}
        aria-hidden={!abierto}
        className={cn(
          'fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm transition-opacity duration-300',
          abierto ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      {/* Menú lateral */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-sidebar-border bg-sidebar shadow-xl transition-transform duration-300 ease-out',
          abierto ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-2 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-deeper text-brand-deeper-foreground">
            <Gem className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div className="leading-tight">
            <span className="block text-base font-bold tracking-tight text-sidebar-foreground">
              ASTRO
            </span>
            <span className="block text-[11px] font-medium text-sidebar-foreground/55">
              {nombresRol[usuario.rol]}
            </span>
          </div>
          <button
            onClick={() => setAbierto(false)}
            className="ml-auto rounded-md p-1.5 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="shrink-0 px-3 pb-2">
          <div className="flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-1.5 focus-within:border-sidebar-ring">
            <Search className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/45" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar módulo…"
              className="w-full bg-transparent text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/45"
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {seccionesFiltradas.length === 0 && (
            <p className="px-3 pt-4 text-xs text-sidebar-foreground/50">Sin resultados</p>
          )}
          {seccionesFiltradas.map((seccion) => (
            <div key={seccion.titulo}>
              <Link
                href={`/inicio#${seccion.slug}`}
                onClick={() => setAbierto(false)}
                className="block px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45 transition-colors hover:text-sidebar-foreground/80"
              >
                {seccion.titulo}
              </Link>
              <div className="flex flex-col gap-0.5">
                {seccion.items.map((item) => {
                  const activo =
                    pathname === item.href ||
                    (item.href !== '/inicio' && pathname.startsWith(item.href + '/'))
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setAbierto(false)}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                        activo
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                      )}
                    >
                      <item.icono className="h-4 w-4 shrink-0" strokeWidth={2} />
                      <span className="flex-1 truncate">{item.etiqueta}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-md px-3 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
              {iniciales}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">
                {usuario.nombre}
              </p>
              <p className="truncate text-xs text-sidebar-foreground/55">
                {nombresRol[usuario.rol]}
              </p>
            </div>
            <form action={cerrarSesion}>
              <button
                type="submit"
                className="text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground"
                aria-label="Cerrar sesión"
              >
                <LogOut className="h-[18px] w-[18px]" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Barra superior */}
      <header className="sticky top-0 z-20">
        <div className="flex h-16 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur md:px-6">
          <button
            onClick={() => setAbierto(true)}
            className="flex shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-foreground/80 transition-colors hover:bg-secondary"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-deeper text-brand-deeper-foreground">
            <Gem className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div className="leading-tight">
            <span className="block text-base font-bold tracking-tight text-foreground">ASTRO</span>
            <span className="block text-[11px] font-medium text-muted-foreground">
              Ecosistema Comercial
            </span>
          </div>
        </div>
        <div className="h-1.5 bg-brand-deeper" />
      </header>

      <div className="flex-1">{children}</div>
    </div>
  )
}
