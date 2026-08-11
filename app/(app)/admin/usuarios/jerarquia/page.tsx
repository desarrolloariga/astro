import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, ArrowLeft, Network, UserCircle, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearFechaHora } from '@/lib/formato'
import { Paginacion } from '@/components/inventario/paginacion'
import { calcularRango, calcularTotalPaginas } from '@/lib/inventario'
import { asignarSuperior } from '../acciones'

export const metadata = { title: 'Jerarquía — ASTRO' }

const TAMANO_PAGINA_HISTORIAL = 25

const nombresRol: Record<string, string> = {
  admin: 'Administración',
  coordinador: 'Coordinación Comercial',
  supervisor: 'Supervisor',
  asesor: 'Asesor de venta',
  embajador: 'Embajador',
  tienda: 'Tienda',
  produccion: 'Producción',
  contabilidad: 'Contabilidad',
}

const clasesCampo =
  'rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'

type Usuario = {
  id: number
  nombre: string
  activo: boolean
  superior_id: number | null
  rol_id: number
  tienda_id: number | null
  roles: { nombre: string } | null
  tiendas: { nombre: string } | null
}

type CambioJerarquia = {
  id: number
  usuario_id: number
  superior_id: number | null
  fecha_inicio: string
  fecha_fin: string | null
}

/** Un match de filtro sin sus ancestros dejaría el árbol roto (nodos
 * huérfanos) — se agrega la cadena de mando completa hacia arriba. */
function conAncestros(idsCoincidentes: Set<number>, usuarios: Usuario[]): Set<number> {
  const porId = new Map(usuarios.map((u) => [u.id, u]))
  const resultado = new Set(idsCoincidentes)
  for (const id of idsCoincidentes) {
    let actual = porId.get(id)
    while (actual?.superior_id != null && !resultado.has(actual.superior_id)) {
      resultado.add(actual.superior_id)
      actual = porId.get(actual.superior_id)
    }
  }
  return resultado
}

export default async function JerarquiaPage({
  searchParams,
}: {
  searchParams: Promise<{
    ok?: string
    error?: string
    buscar?: string
    rol?: string
    tienda_id?: string
    pagina?: string
  }>
}) {
  if (!(await tienePermiso('usuarios', 'ver'))) redirect('/inicio')
  const puedeEditar = await tienePermiso('usuarios', 'editar')

  const sp = await searchParams
  const { ok, error } = sp
  const buscar = (sp.buscar ?? '').trim().toLowerCase()
  const rolFiltro = (sp.rol ?? '').trim()
  const tiendaFiltro = sp.tienda_id ? Number(sp.tienda_id) : null
  const pagina = Math.max(1, Number(sp.pagina ?? '1') || 1)
  const supabase = await createClient()

  const { desde, hasta } = calcularRango(pagina, TAMANO_PAGINA_HISTORIAL)

  const [{ data }, { data: tiendasData }, { data: historialData, count: totalHistorial }] = await Promise.all([
    supabase
      .from('usuarios')
      .select('id, nombre, activo, superior_id, rol_id, tienda_id, roles ( nombre ), tiendas ( nombre )')
      .order('nombre'),
    supabase.from('tiendas').select('id, nombre').eq('activo', true).order('nombre'),
    supabase
      .from('historial_jerarquia')
      .select('id, usuario_id, superior_id, fecha_inicio, fecha_fin', { count: 'exact' })
      .order('fecha_inicio', { ascending: false })
      .range(desde, hasta),
  ])

  const todosUsuarios = (data ?? []) as unknown as Usuario[]
  const tiendas = tiendasData ?? []
  const nombrePorId = new Map(todosUsuarios.map((u) => [u.id, u.nombre]))
  const historial = (historialData ?? []) as CambioJerarquia[]
  const totalPaginasHistorial = calcularTotalPaginas(totalHistorial ?? 0, TAMANO_PAGINA_HISTORIAL)
  const construirHrefHistorial = (paginaDestino: number) => {
    const params = new URLSearchParams()
    if (buscar) params.set('buscar', sp.buscar ?? '')
    if (rolFiltro) params.set('rol', rolFiltro)
    if (tiendaFiltro) params.set('tienda_id', String(tiendaFiltro))
    if (paginaDestino > 1) params.set('pagina', String(paginaDestino))
    const qs = params.toString()
    return `/admin/usuarios/jerarquia${qs ? `?${qs}` : ''}#historial`
  }

  const hayFiltro = Boolean(buscar || rolFiltro || tiendaFiltro)
  let usuarios = todosUsuarios
  if (hayFiltro) {
    const coincidencias = new Set(
      todosUsuarios
        .filter((u) => {
          if (buscar && !u.nombre.toLowerCase().includes(buscar)) return false
          if (rolFiltro && u.roles?.nombre !== rolFiltro) return false
          if (tiendaFiltro && u.tienda_id !== tiendaFiltro) return false
          return true
        })
        .map((u) => u.id),
    )
    const idsVisibles = conAncestros(coincidencias, todosUsuarios)
    usuarios = todosUsuarios.filter((u) => idsVisibles.has(u.id))
  }

  const idsValidos = new Set(usuarios.map((u) => u.id))
  const hijosDe = new Map<number | null, Usuario[]>()
  for (const u of usuarios) {
    const clave = u.superior_id != null && idsValidos.has(u.superior_id) ? u.superior_id : null
    const lista = hijosDe.get(clave) ?? []
    lista.push(u)
    hijosDe.set(clave, lista)
  }
  const raices = hijosDe.get(null) ?? []

  function Nodo({ usuario, nivel }: { usuario: Usuario; nivel: number }) {
    const hijos = hijosDe.get(usuario.id) ?? []
    const esCoincidencia = hayFiltro && buscar && usuario.nombre.toLowerCase().includes(buscar)
    return (
      <div style={{ marginLeft: nivel > 0 ? 24 : 0 }} className={nivel > 0 ? 'border-l border-border pl-4' : ''}>
        <div
          className={
            esCoincidencia
              ? 'mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-primary bg-primary/5 p-3'
              : 'mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3'
          }
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {usuario.nombre}
              {!usuario.activo && (
                <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                  Desactivado
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {nombresRol[usuario.roles?.nombre ?? ''] ?? usuario.roles?.nombre}
              {usuario.tiendas?.nombre && ` · ${usuario.tiendas.nombre}`}
            </p>
          </div>

          <Link
            href={`/admin/usuarios/${usuario.id}`}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            <UserCircle className="h-3.5 w-3.5" />
            Perfil
          </Link>

          {puedeEditar && (
            <form action={asignarSuperior} className="flex items-center gap-1.5">
              <input type="hidden" name="id" value={usuario.id} />
              <select
                name="superior_id"
                defaultValue={usuario.superior_id ?? ''}
                className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">Sin superior</option>
                {todosUsuarios
                  .filter((u) => u.id !== usuario.id)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
              </select>
              <button
                type="submit"
                className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
              >
                Mover
              </button>
            </form>
          )}
        </div>

        {hijos.length > 0 && (
          <div className="flex flex-col gap-0">
            {hijos.map((h) => (
              <Nodo key={h.id} usuario={h} nivel={nivel + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <Link
        href="/admin/usuarios"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a usuarios
      </Link>

      <div className="flex items-center gap-2">
        <Network className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Jerarquía</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Estructura de mando: coordinadores, supervisores, asesores y sus embajadores.
          </p>
        </div>
      </div>

      {ok && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{ok}</span>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form className="flex flex-wrap items-center gap-2">
        <input
          name="buscar"
          defaultValue={sp.buscar ?? ''}
          placeholder="Buscar por nombre…"
          className={`${clasesCampo} min-w-48 flex-1`}
        />
        <select name="rol" defaultValue={rolFiltro} className={clasesCampo}>
          <option value="">Todos los roles</option>
          {Object.entries(nombresRol).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>
        <select name="tienda_id" defaultValue={tiendaFiltro ?? ''} className={clasesCampo}>
          <option value="">Todas las tiendas</option>
          {tiendas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          Filtrar
        </button>
      </form>

      {raices.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin coincidencias para este filtro.</p>
      ) : (
        <div className="flex flex-col gap-0">
          {raices.map((u) => (
            <Nodo key={u.id} usuario={u} nivel={0} />
          ))}
        </div>
      )}

      <section id="historial" className="flex scroll-mt-6 flex-col gap-3 border-t border-border pt-6">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <History className="h-4 w-4 text-primary" /> Historial de cambios de jerarquía
        </h2>
        {historial.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin cambios de jerarquía todavía.</p>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-semibold">Usuario</th>
                    <th className="px-4 py-2 font-semibold">Superior</th>
                    <th className="px-4 py-2 font-semibold">Desde</th>
                    <th className="px-4 py-2 font-semibold">Hasta</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((h) => (
                    <tr key={h.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 text-foreground">{nombrePorId.get(h.usuario_id) ?? `#${h.usuario_id}`}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {h.superior_id ? nombrePorId.get(h.superior_id) ?? `#${h.superior_id}` : 'Sin superior'}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{formatearFechaHora(h.fecha_inicio)}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {h.fecha_fin ? formatearFechaHora(h.fecha_fin) : 'Vigente'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacion
              paginaActual={pagina}
              totalPaginas={totalPaginasHistorial}
              total={totalHistorial ?? 0}
              construirHref={construirHrefHistorial}
            />
          </>
        )}
      </section>
    </main>
  )
}
