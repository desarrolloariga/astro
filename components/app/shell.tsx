'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Gem, Menu, X, LogOut, Search, ChevronDown, ShoppingCart, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { cerrarSesion } from '@/app/(auth)/acciones'
import { seccionesParaRol, nombresRol, agruparPorSubgrupo, type ItemNav } from '@/lib/navegacion'
import type { Rol } from '@/lib/usuario'

/** Ícono de carrito con contador — enlaza a /carrito. */
function BotonCarrito({ unidades }: { unidades: number }) {
  return (
    <Link
      href="/carrito"
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-foreground/80 md:h-9 md:w-9 transition-colors hover:bg-secondary"
      aria-label={`Carrito (${unidades})`}
    >
      <ShoppingCart className="h-5 w-5" />
      {unidades > 0 && (
        <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
          {unidades}
        </span>
      )}
    </Link>
  )
}

/** Módulos que van en la barra inferior del celular, en orden de prioridad (los primeros 4 que el usuario pueda ver). */
const PRIORIDAD_BARRA = [
  '/inicio',
  '/catalogo',
  '/pedidos',
  '/red',
  '/logistica',
  '/contabilidad/comprobantes',
  '/ventas',
  '/produccion',
  '/inventario',
  '/compras',
  '/links',
  '/ranking',
]

function esActivo(pathname: string, href: string) {
  return pathname === href || (href !== '/inicio' && pathname.startsWith(href + '/'))
}

/** Barra inferior tipo app (solo celular): accesos directos + botón de menú completo. */
function BarraInferior({ items, pathname, onMenu }: { items: ItemNav[]; pathname: string; onMenu: () => void }) {
  return (
    <nav
      aria-label="Accesos rápidos"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const activo = esActivo(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={activo ? 'page' : undefined}
              className={cn(
                'flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors',
                activo ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', activo && 'bg-primary/10')}>
                <item.icono className="h-5 w-5" strokeWidth={2} />
              </span>
              <span className="max-w-full truncate px-1">{item.etiqueta}</span>
            </Link>
          )
        })}
        <button
          type="button"
          onClick={onMenu}
          className="flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-semibold text-muted-foreground"
        >
          <span className="flex h-7 w-12 items-center justify-center rounded-full">
            <LayoutGrid className="h-5 w-5" strokeWidth={2} />
          </span>
          Menú
        </button>
      </div>
    </nav>
  )
}

export function AppShell({
  usuario,
  permisosExtra = [],
  permisosRevocados = [],
  unidadesCarrito = null,
  children,
}: {
  usuario: { nombre: string; rol: Rol }
  permisosExtra?: string[]
  permisosRevocados?: string[]
  /** null = el usuario no compra desde el catálogo (sin ícono de carrito). */
  unidadesCarrito?: number | null
  children: React.ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [seccionesColapsadas, setSeccionesColapsadas] = useState<Set<string>>(new Set())
  const pathname = usePathname()

  function alternarSeccion(slug: string) {
    setSeccionesColapsadas((prev) => {
      const siguiente = new Set(prev)
      if (siguiente.has(slug)) siguiente.delete(slug)
      else siguiente.add(slug)
      return siguiente
    })
  }

  const seccionesVisibles = useMemo(
    () => seccionesParaRol(usuario.rol, permisosExtra, permisosRevocados),
    [usuario.rol, permisosExtra, permisosRevocados],
  )

  // Con el menú abierto en el celular, la página de atrás no se desplaza; Escape lo cierra.
  useEffect(() => {
    if (!abierto) return
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    window.addEventListener('keydown', alTeclear)
    return () => {
      document.body.style.overflow = previo
      window.removeEventListener('keydown', alTeclear)
    }
  }, [abierto])

  const itemsBarra = useMemo(() => {
    const todos = seccionesVisibles.flatMap((s) => s.items)
    return PRIORIDAD_BARRA.map((href) => todos.find((i) => i.href === href)).filter((i): i is ItemNav => Boolean(i)).slice(0, 4)
  }, [seccionesVisibles])

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
    <div className="flex min-h-svh bg-background">
      {/* Fondo del menú lateral — solo aplica en móvil, el menú es fijo desde md: */}
      <div
        onClick={() => setAbierto(false)}
        aria-hidden={!abierto}
        className={cn(
          'fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm transition-opacity duration-300 md:hidden',
          abierto ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      {/* Menú lateral — siempre visible desde md:, en móvil sigue siendo un cajón deslizable */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[85vw] max-w-72 flex-col border-r border-sidebar-border bg-sidebar pt-[env(safe-area-inset-top)] shadow-xl transition-transform duration-300 ease-out md:w-72 md:pt-0',
          'md:sticky md:top-0 md:z-0 md:h-svh md:shrink-0 md:translate-x-0 md:shadow-none',
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
            className="ml-auto rounded-md p-1.5 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden"
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

        <nav className="flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
          {seccionesFiltradas.length === 0 && (
            <p className="px-3 pt-4 text-xs text-sidebar-foreground/50">Sin resultados</p>
          )}
          {seccionesFiltradas.map((seccion) => {
            const expandida = consulta.length > 0 || !seccionesColapsadas.has(seccion.slug)
            return (
              <div key={seccion.titulo}>
                <div className="flex items-center px-1 pb-1 pt-4">
                  <Link
                    href={`/inicio#${seccion.slug}`}
                    onClick={() => setAbierto(false)}
                    className="flex-1 truncate px-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45 transition-colors hover:text-sidebar-foreground/80"
                  >
                    {seccion.titulo}
                  </Link>
                  <button
                    type="button"
                    onClick={() => alternarSeccion(seccion.slug)}
                    aria-expanded={expandida}
                    aria-label={expandida ? `Contraer ${seccion.titulo}` : `Expandir ${seccion.titulo}`}
                    className="rounded p-2.5 text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground/80 md:p-1.5"
                  >
                    <ChevronDown
                      className={cn('h-3 w-3 transition-transform duration-200', !expandida && '-rotate-90')}
                    />
                  </button>
                </div>
                {expandida && (
                  <div className="flex flex-col gap-0.5">
                    {agruparPorSubgrupo(seccion.items).map((grupo, indice) => (
                      <div key={grupo.subgrupo ?? `sin-subgrupo-${indice}`} className={indice > 0 ? 'mt-2' : undefined}>
                        {grupo.subgrupo && (
                          <p className="px-3 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-sidebar-foreground/35">
                            {grupo.subgrupo}
                          </p>
                        )}
                        {grupo.items.map((item) => {
                          const activo = esActivo(pathname, item.href)
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setAbierto(false)}
                              className={cn(
                                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors md:gap-2.5 md:py-1.5 md:text-xs',
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
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="shrink-0 border-t border-sidebar-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3">
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
                className="flex h-10 w-10 items-center justify-center rounded-md text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground md:h-auto md:w-auto"
                aria-label="Cerrar sesión"
              >
                <LogOut className="h-[18px] w-[18px]" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Columna derecha: barra superior (solo móvil) + contenido */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 bg-card/90 pt-[env(safe-area-inset-top)] md:bg-transparent md:pt-0">
          <div className="flex h-16 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur md:hidden">
            <button
              onClick={() => setAbierto(true)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-secondary"
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
            {unidadesCarrito != null && (
              <div className="ml-auto">
                <BotonCarrito unidades={unidadesCarrito} />
              </div>
            )}
          </div>
          {unidadesCarrito != null && (
            <div className="hidden h-12 items-center justify-end border-b border-border bg-card/90 px-6 backdrop-blur md:flex">
              <BotonCarrito unidades={unidadesCarrito} />
            </div>
          )}
          <div className="h-1.5 bg-brand-deeper" />
        </header>

        <div className="pb-barra-movil flex-1">{children}</div>
      </div>

      {itemsBarra.length > 0 && <BarraInferior items={itemsBarra} pathname={pathname} onMenu={() => setAbierto(true)} />}
    </div>
  )
}
