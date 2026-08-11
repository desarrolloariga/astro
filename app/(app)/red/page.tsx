import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, UserPlus, Users, Phone, Sparkles, Trophy, Percent } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { tienePermiso } from '@/lib/permisos'
import { formatearNumero } from '@/lib/formato'
import { crearEmbajador } from './acciones'

export const metadata = { title: 'Mi red — ASTRO' }

const nombresTipo: Record<string, string> = {
  A1: 'A1 · Ya compró con nosotros',
  B2: 'B2 · Familiar / amigo / conocido',
  C3: 'C3 · Redes sociales',
  D4: 'D4 · De comisión',
}

type MiembroRed = {
  usuario_id: number
  nombre: string
  rol: string
  tipo_embajador: string | null
  ventas_periodo: number | null
  num_ventas_periodo: number | null
}

type Contacto = { nombre: string; telefono: string | null }

export default async function MiRedPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol === 'supervisor') redirect('/red/equipo')
  if (!['asesor', 'embajador', 'admin'].includes(usuario.rol)) redirect('/inicio')

  const { ok, error } = await searchParams
  const supabase = await createClient()

  if (usuario.rol === 'embajador') {
    const [{ data: contactoData }, { data: puntosData }, { data: linksData }, { data: parametroDefault }] =
      await Promise.all([
        supabase.rpc('fn_mi_contacto_asesor'),
        supabase
          .from('vw_ranking')
          .select('puntos_totales, posicion')
          .eq('usuario_id', usuario.id)
          .order('periodo_id', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('links_venta')
          .select('id, tipo, estado, comision_embajador_pct')
          .eq('estado', 'activo')
          .order('fecha_creacion', { ascending: false }),
        supabase
          .from('parametros')
          .select('valor')
          .eq('clave', 'comision_embajador_catalogo_pct_default')
          .maybeSingle(),
      ])

    const contacto = contactoData?.[0] as Contacto | undefined
    const links = (linksData ?? []) as { id: number; tipo: string; comision_embajador_pct: number | null }[]
    const pctDefault = Number(parametroDefault?.valor ?? 0)

    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8 md:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Mi red</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tu contacto, tus puntos y el catálogo.</p>
        </div>

        {ok && (
          <div className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-sm text-primary">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{ok}</span>
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
            <Phone className="h-4 w-4 text-primary" />
            Tu asesor
          </h2>
          {contacto ? (
            <div className="text-sm text-foreground">
              <p className="font-semibold">{contacto.nombre}</p>
              <p className="text-muted-foreground">{contacto.telefono ?? 'Sin teléfono registrado'}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aún no tienes un asesor asignado.</p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
            <Trophy className="h-4 w-4 text-primary" />
            Tus puntos
          </h2>
          <p className="text-2xl font-bold text-foreground">
            {formatearNumero(puntosData?.puntos_totales ?? 0)}
          </p>
          {puntosData?.posicion && (
            <p className="text-xs text-muted-foreground">Posición #{puntosData.posicion} este período</p>
          )}
        </div>

        {links.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
              <Percent className="h-4 w-4 text-primary" />
              Lo que ganas por catálogo
            </h2>
            <div className="flex flex-col gap-2">
              {links.map((l) => (
                <div key={l.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    {l.tipo === 'catalogo' ? 'Catálogo completo' : l.tipo === 'pieza' ? 'Pieza única' : 'Selección'}
                  </span>
                  <span className="font-semibold text-foreground">
                    {formatearNumero(l.comision_embajador_pct ?? pctDefault)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/catalogo"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
          >
            <Sparkles className="h-4 w-4" />
            Ver catálogo
          </Link>
          <Link
            href="/links"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            Mis enlaces
          </Link>
        </div>
      </main>
    )
  }

  // Vista de asesor (y admin, para inspección)
  const puedeCrear = await tienePermiso('usuarios', 'crear_embajador')

  const [{ data: redData }, { data: descuento }] = await Promise.all([
    supabase
      .from('vw_mi_red')
      .select('usuario_id, nombre, rol, tipo_embajador, ventas_periodo, num_ventas_periodo')
      .eq('rol', 'embajador')
      .order('nombre'),
    supabase.rpc('fn_descuento_desempeno', { p_vendedor_id: usuario.id }),
  ])

  const embajadores = (redData ?? []) as MiembroRed[]

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Mi red</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {embajadores.length} embajador{embajadores.length !== 1 ? 'es' : ''} · tu descuento por desempeño: {' '}
          <span className="font-semibold text-foreground">{formatearNumero(Number(descuento ?? 0))}%</span>
        </p>
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

      {puedeCrear && (
        <details className="rounded-xl border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground">
            <UserPlus className="h-4 w-4 text-primary" />
            Crear embajador
          </summary>
          <form action={crearEmbajador} className="flex flex-col gap-3 px-4 pb-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                name="nombre"
                required
                placeholder="Nombre completo"
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <input
                name="correo"
                type="email"
                required
                placeholder="Correo electrónico"
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                name="telefono"
                placeholder="Teléfono (opcional)"
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <select
                name="tipo_embajador"
                required
                defaultValue=""
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="" disabled>
                  Tipo de embajador
                </option>
                {Object.entries(nombresTipo).map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="mt-1 w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
            >
              Crear embajador
            </button>
          </form>
        </details>
      )}

      {embajadores.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Users className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Aún no tienes embajadores</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {embajadores.map((e) => (
            <div
              key={e.usuario_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-4"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">{e.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {e.tipo_embajador ? nombresTipo[e.tipo_embajador] : 'Sin tipo'}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {e.num_ventas_periodo ?? 0} venta{(e.num_ventas_periodo ?? 0) !== 1 ? 's' : ''} este mes
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
