import { Fragment } from 'react'
import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, ShieldCheck, Check, X as XIcon, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { cn } from '@/lib/utils'
import { alternarRolPermiso, otorgarPermisoIndividual, quitarPermisoIndividual } from './acciones'

export const metadata = { title: 'Permisos — ASTRO' }

const nombresRol: Record<string, string> = {
  admin: 'Admin',
  coordinador: 'Coordinador',
  supervisor: 'Supervisor',
  asesor: 'Asesor',
  embajador: 'Embajador',
  tienda: 'Tienda',
  produccion: 'Producción',
  contabilidad: 'Contabilidad',
}

type Rol = { id: number; nombre: string }
type Permiso = { id: number; modulo: string; accion: string; descripcion: string | null }
type RolPermiso = { rol_id: number; permiso_id: number }
type Usuario = { id: number; nombre: string; correo: string }
type ExcepcionIndividual = {
  id: number
  concedido: boolean
  usuarios: { nombre: string } | null
  permisos: { modulo: string; accion: string } | null
}

export default async function AdminPermisosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'admin') redirect('/inicio')

  const { ok, error } = await searchParams
  const supabase = await createClient()

  const [
    { data: roles },
    { data: permisos },
    { data: rolesPermisos },
    { data: usuarios },
    { data: excepciones },
  ] = await Promise.all([
    supabase.from('roles').select('id, nombre').order('id'),
    supabase.from('permisos').select('id, modulo, accion, descripcion').order('modulo').order('accion'),
    supabase.from('roles_permisos').select('rol_id, permiso_id'),
    supabase.from('usuarios').select('id, nombre, correo').eq('activo', true).order('nombre').limit(300),
    supabase
      .from('usuarios_permisos')
      .select('id, concedido, usuarios ( nombre ), permisos ( modulo, accion )')
      .order('id', { ascending: false }),
  ])

  const listaRoles = (roles ?? []) as Rol[]
  const listaPermisos = (permisos ?? []) as Permiso[]
  const otorgados = new Set(
    ((rolesPermisos ?? []) as RolPermiso[]).map((rp) => `${rp.rol_id}-${rp.permiso_id}`),
  )
  const listaUsuarios = (usuarios ?? []) as Usuario[]
  const listaExcepciones = (excepciones ?? []) as unknown as ExcepcionIndividual[]

  const permisosPorModulo = new Map<string, Permiso[]>()
  listaPermisos.forEach((p) => {
    permisosPorModulo.set(p.modulo, [...(permisosPorModulo.get(p.modulo) ?? []), p])
  })

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Permisos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Matriz por rol y excepciones individuales — se aplican de verdad en cada acción, no solo
          en el menú.
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
      <div className="flex items-start gap-2 rounded-lg bg-accent px-3 py-2.5 text-xs text-accent-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Estos {listaPermisos.length} permisos son los que ya evalúan las políticas y funciones de
          la base de datos. No cubren todo el sistema — el resto sigue protegido por rol fijo
          (ej. quién puede vender según su rol comercial).
        </span>
      </div>

      {/* Matriz rol × permiso */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" /> Matriz por rol
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="sticky left-0 bg-card px-4 py-2 font-semibold">Permiso</th>
                {listaRoles.map((r) => (
                  <th key={r.id} className="px-2 py-2 text-center font-semibold">
                    {nombresRol[r.nombre] ?? r.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from(permisosPorModulo.entries()).map(([modulo, filas]) => (
                <Fragment key={modulo}>
                  <tr className="border-b border-border bg-secondary/50">
                    <td colSpan={listaRoles.length + 1} className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      {modulo}
                    </td>
                  </tr>
                  {filas.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="sticky left-0 bg-card px-4 py-2 text-foreground">
                        {p.accion}
                        {p.descripcion && (
                          <span className="ml-1.5 text-xs text-muted-foreground">— {p.descripcion}</span>
                        )}
                      </td>
                      {listaRoles.map((r) => {
                        const clave = `${r.id}-${p.id}`
                        const concedido = otorgados.has(clave)
                        return (
                          <td key={r.id} className="px-2 py-2 text-center">
                            <form action={alternarRolPermiso}>
                              <input type="hidden" name="rol_id" value={r.id} />
                              <input type="hidden" name="permiso_id" value={p.id} />
                              <input type="hidden" name="concedido" value={concedido ? '1' : '0'} />
                              <button
                                type="submit"
                                aria-label={concedido ? 'Quitar permiso' : 'Otorgar permiso'}
                                className={cn(
                                  'mx-auto flex h-6 w-6 items-center justify-center rounded-full transition-colors',
                                  concedido
                                    ? 'bg-primary/10 text-primary hover:bg-primary/20'
                                    : 'bg-muted text-muted-foreground/40 hover:bg-muted/70',
                                )}
                              >
                                {concedido ? <Check className="h-3.5 w-3.5" /> : <XIcon className="h-3.5 w-3.5" />}
                              </button>
                            </form>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Excepciones individuales */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold text-foreground">Excepciones individuales</h2>
        <p className="text-xs text-muted-foreground">
          Otorga o revoca un permiso puntual para una persona, sin cambiar su rol.
        </p>

        {listaExcepciones.length > 0 && (
          <div className="flex flex-col gap-2">
            {listaExcepciones.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
                <p className="text-sm text-foreground">
                  <span className="font-semibold">{e.usuarios?.nombre}</span>
                  {' — '}
                  {e.permisos?.modulo}.{e.permisos?.accion}
                  <span
                    className={cn(
                      'ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      e.concedido ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive',
                    )}
                  >
                    {e.concedido ? 'Concedido' : 'Revocado'}
                  </span>
                </p>
                <form action={quitarPermisoIndividual}>
                  <input type="hidden" name="id" value={e.id} />
                  <button type="submit" className="text-xs font-semibold text-muted-foreground transition-colors hover:text-destructive">
                    Quitar
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}

        <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">
            + Nueva excepción
          </summary>
          <form action={otorgarPermisoIndividual} className="flex flex-wrap items-end gap-3 px-4 pb-4">
            <label className="flex flex-1 min-w-48 flex-col gap-1 text-xs text-muted-foreground">
              Persona
              <select name="usuario_id" required defaultValue="" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
                <option value="" disabled>Elige</option>
                {listaUsuarios.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre} ({u.correo})</option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 min-w-48 flex-col gap-1 text-xs text-muted-foreground">
              Permiso
              <select name="permiso_id" required defaultValue="" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
                <option value="" disabled>Elige</option>
                {listaPermisos.map((p) => (
                  <option key={p.id} value={p.id}>{p.modulo}.{p.accion}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Acción
              <select name="concedido" required defaultValue="true" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
                <option value="true">Conceder</option>
                <option value="false">Revocar</option>
              </select>
            </label>
            <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
              Guardar
            </button>
          </form>
        </details>
      </section>
    </main>
  )
}
