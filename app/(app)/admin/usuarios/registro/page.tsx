import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { ExternalLink, Link2, MessageCircle, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { cn } from '@/lib/utils'
import { MENSAJES_EXPECTATIVA, MENSAJE_BIENVENIDA, TITULO_BIENVENIDA, estadoEnlace, urlRegistro, type EnlaceRegistro } from '@/lib/registro-embajadores'
import { CopyButton } from '@/components/app/copy-button'
import { Encabezado, EnlaceVolver, Mensajes } from '@/components/contabilidad/comunes'
import { clasesCampo } from '@/lib/contabilidad-general'
import { actualizarEnlaceRegistro, alternarEnlaceRegistro, crearEnlaceRegistro } from './acciones'

export const metadata = { title: 'Registro de embajadores — ASTRO' }

type Fila = EnlaceRegistro & {
  superior: { nombre: string } | null
  registrados: { id: number; nombre: string; correo: string; telefono: string | null; fecha_creacion: string }[]
}

const fecha = (f: string | null) => (f ? new Date(f).toLocaleDateString('es-GT', { timeZone: 'America/Guatemala' }) : '—')

function CamposBienvenida({ e }: { e?: EnlaceRegistro }) {
  return (
    <>
      <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
        Título de bienvenida
        <input name="titulo_bienvenida" defaultValue={e?.titulo_bienvenida ?? TITULO_BIENVENIDA} className={clasesCampo} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
        Mensaje de bienvenida
        <textarea name="mensaje_bienvenida" rows={2} defaultValue={e ? (e.mensaje_bienvenida ?? '') : MENSAJE_BIENVENIDA} className={clasesCampo} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2 lg:col-span-3">
        Mensajes de expectativa (uno por línea, máximo 8)
        <textarea
          name="mensajes_expectativa"
          rows={4}
          defaultValue={(e ? e.mensajes_expectativa : MENSAJES_EXPECTATIVA).join('\n')}
          className={clasesCampo}
        />
      </label>
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Fecha de lanzamiento (cuenta regresiva)
          <input name="fecha_lanzamiento" type="date" defaultValue={e?.fecha_lanzamiento ?? ''} className={clasesCampo} />
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" name="permitir_ingreso" defaultChecked={e?.permitir_ingreso ?? true} /> Mostrar el botón para entrar a su cuenta
        </label>
      </div>
    </>
  )
}

export default async function RegistroEmbajadoresPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const [esAdmin, puedeEmbajador, yo, { data }, { data: superioresData }] = await Promise.all([
    tienePermiso('usuarios', 'crear'),
    tienePermiso('usuarios', 'crear_embajador'),
    obtenerUsuarioActual(),
    supabase
      .from('enlaces_registro')
      .select('*, superior:superior_id ( nombre ), registrados:usuarios!usuarios_enlace_registro_id_fkey ( id, nombre, correo, telefono, fecha_creacion )')
      .order('fecha_creacion', { ascending: false }),
    supabase.from('usuarios').select('id, nombre, roles!inner ( nombre )').eq('activo', true).in('roles.nombre', ['asesor', 'admin']).order('nombre'),
  ])
  if (!esAdmin && !puedeEmbajador) redirect('/inicio')
  const enlaces = (data ?? []) as unknown as Fila[]
  const superiores = (superioresData ?? []) as unknown as { id: number; nombre: string; roles: { nombre: string } }[]
  const h = await headers()
  const base = process.env.NEXT_PUBLIC_APP_URL || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`
  const totalRegistrados = enlaces.reduce((s, e) => s + e.registrados.length, 0)

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={UserPlus}
        titulo="Registro de embajadores"
        descripcion="Enlaces públicos para que los embajadores creen su propia cuenta. Al registrarse ven un mensaje de felicitación y las novedades que vienen."
      >
        {esAdmin && <EnlaceVolver href="/admin/usuarios">← Usuarios</EnlaceVolver>}
      </Encabezado>
      <Mensajes ok={sp.ok} error={sp.error} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { e: 'Enlaces activos', v: enlaces.filter((e) => estadoEnlace(e).disponible).length },
          { e: 'Embajadores registrados por enlace', v: totalRegistrados },
          { e: 'Enlaces creados', v: enlaces.length },
        ].map((k) => (
          <div key={k.e} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{k.e}</p>
            <p className="text-2xl font-bold tabular-nums">{k.v}</p>
          </div>
        ))}
      </div>

      <details className="rounded-xl border border-primary/40 bg-card" open={enlaces.length === 0}>
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold">
          <Link2 className="h-4 w-4 text-primary" /> Crear enlace de registro
        </summary>
        <form action={crearEnlaceRegistro} className="grid grid-cols-1 gap-3 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
            Nombre del enlace (solo lo ves tú)
            <input name="nombre" required placeholder="Ej. Lanzamiento diciembre · Instagram" className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Los nuevos embajadores reportan a
            {esAdmin ? (
              <select name="superior_id" defaultValue={yo.id} className={clasesCampo}>
                {superiores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre} · {s.roles.nombre === 'admin' ? 'Administración' : 'Asesor'}
                  </option>
                ))}
              </select>
            ) : (
              <span className="rounded-lg border border-dashed border-border px-3 py-2 text-sm font-normal">{yo.nombre} (tú)</span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Tipo de embajador
            <select name="tipo_embajador" defaultValue="A1" className={clasesCampo}>
              {['A1', 'B2', 'C3', 'D4'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Vence (opcional)
            <input name="vence" type="date" className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Cupo máximo (opcional)
            <input name="cupo" type="number" min={1} placeholder="Sin límite" className={clasesCampo} />
          </label>
          <p className="self-end text-xs text-muted-foreground sm:col-span-2">
            Lo que sigue es lo que verá cada embajador al terminar su registro.
          </p>
          <CamposBienvenida />
          <div className="sm:col-span-2 lg:col-span-4">
            <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Crear enlace
            </button>
          </div>
        </form>
      </details>

      {enlaces.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">Aún no hay enlaces de registro.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {enlaces.map((e) => {
            const url = urlRegistro(base, e.token)
            const est = estadoEnlace(e)
            const whatsapp = `https://wa.me/?text=${encodeURIComponent(`¡Únete a la red de embajadores ASTRO! Regístrate aquí: ${url}`)}`
            return (
              <li key={e.id} className={cn('flex flex-col gap-3 rounded-xl border bg-card p-4', est.disponible ? 'border-border' : 'border-border opacity-80')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {e.nombre}
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', est.disponible ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                        {est.disponible ? 'Activo' : est.motivo}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Reportan a {e.superior?.nombre ?? '—'} · tipo {e.tipo_embajador} · {e.usos} registro(s)
                      {e.cupo ? ` de ${e.cupo}` : ''}
                      {e.vence ? ` · vence ${fecha(e.vence)}` : ''} · creado {fecha(e.fecha_creacion)}
                    </p>
                  </div>
                  <form action={alternarEnlaceRegistro}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="activo" value={e.activo ? 'no' : 'si'} />
                    <button type="submit" className="text-xs font-semibold text-muted-foreground hover:text-foreground">
                      {e.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </form>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-xs">{url}</code>
                  <CopyButton texto={url} />
                  <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                  <Link href={`/registro/${e.token}`} target="_blank" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
                    <ExternalLink className="h-3.5 w-3.5" /> Ver
                  </Link>
                  <Link href={`/registro/${e.token}/bienvenida?vista=previa`} target="_blank" className="text-xs font-semibold text-primary hover:underline">
                    Vista previa de la bienvenida
                  </Link>
                </div>
                <details>
                  <summary className="cursor-pointer text-xs font-semibold text-primary">Editar mensajes de bienvenida</summary>
                  <form action={actualizarEnlaceRegistro} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <input type="hidden" name="id" value={e.id} />
                    <CamposBienvenida e={e} />
                    <div className="sm:col-span-2 lg:col-span-4">
                      <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                        Guardar mensajes
                      </button>
                    </div>
                  </form>
                </details>
                {e.registrados.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold text-primary">Embajadores registrados ({e.registrados.length})</summary>
                    <ul className="mt-2 divide-y divide-border/60 text-sm">
                      {e.registrados
                        .sort((a, b) => b.fecha_creacion.localeCompare(a.fecha_creacion))
                        .map((r) => (
                          <li key={r.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                            <span>
                              {esAdmin ? (
                                <Link href={`/admin/usuarios/${r.id}`} className="font-semibold hover:underline">
                                  {r.nombre}
                                </Link>
                              ) : (
                                <span className="font-semibold">{r.nombre}</span>
                              )}
                              <span className="text-xs text-muted-foreground"> · {r.correo}{r.telefono ? ` · ${r.telefono}` : ''}</span>
                            </span>
                            <span className="text-xs text-muted-foreground">{fecha(r.fecha_creacion)}</span>
                          </li>
                        ))}
                    </ul>
                  </details>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
