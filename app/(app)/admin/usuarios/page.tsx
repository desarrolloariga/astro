import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, UserPlus, Users, Network, UserCircle, IdCard, Shield, Wallet2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { crearUsuario, actualizarUsuario, alternarActivoUsuario } from './acciones'
import { Campo, SeccionFormulario, BotonPrimario, clasesInput } from '@/components/app/formulario'

export const metadata = { title: 'Usuarios — ASTRO' }

type Usuario = {
  id: number
  nombre: string
  correo: string
  activo: boolean
  rol_id: number
  tienda_id: number | null
  superior_id: number | null
  roles: { nombre: string } | null
  tiendas: { nombre: string } | null
}
type Rol = { id: number; nombre: string }
type Tienda = { id: number; nombre: string }

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

export default async function AdminUsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  if (!(await tienePermiso('usuarios', 'ver'))) redirect('/inicio')
  const puedeVerLaboral = await tienePermiso('usuarios', 'editar_laboral')

  const { ok, error } = await searchParams
  const supabase = await createClient()

  const [{ data: usuarios }, { data: roles }, { data: tiendas }] = await Promise.all([
    supabase
      .from('usuarios')
      .select('id, nombre, correo, activo, rol_id, tienda_id, superior_id, roles ( nombre ), tiendas ( nombre )')
      .order('nombre'),
    supabase.from('roles').select('id, nombre').order('nombre'),
    supabase.from('tiendas').select('id, nombre').eq('activo', true).order('nombre'),
  ])

  const listaUsuarios = (usuarios ?? []) as unknown as Usuario[]
  const listaRoles = (roles ?? []) as Rol[]
  const listaTiendas = (tiendas ?? []) as Tienda[]
  const superioresPosibles = listaUsuarios.filter((u) => u.activo)

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Usuarios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {listaUsuarios.length} usuarios · crea cuentas, asigna rol, tienda y jerarquía.
          </p>
        </div>
        <Link
          href="/admin/usuarios/jerarquia"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          <Network className="h-4 w-4" />
          Ver jerarquía
        </Link>
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

      <details className="rounded-xl border border-border bg-card shadow-xs">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-sm font-semibold text-foreground">
          <UserPlus className="h-4 w-4 text-primary" />
          Crear usuario
        </summary>
        <form action={crearUsuario} className="flex flex-col gap-4 px-5 pb-5">
          <SeccionFormulario icon={IdCard} titulo="Cuenta" className="border-0 bg-secondary/30 p-4 shadow-none">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Campo label="Nombre completo" required>
                  <input name="nombre" required className={clasesInput} />
                </Campo>
                <Campo label="Correo electrónico" required>
                  <input name="correo" type="email" required className={clasesInput} />
                </Campo>
              </div>
              <Campo label="Teléfono">
                <input name="telefono" className={clasesInput} />
              </Campo>
              <Campo
                label="Contraseña temporal"
                required
                helpText="Mínimo 8 caracteres — pídele a la persona que la cambie al ingresar."
              >
                <input name="contrasena" type="text" required minLength={8} className={clasesInput} />
              </Campo>
            </div>
          </SeccionFormulario>

          <SeccionFormulario icon={Shield} titulo="Rol y jerarquía" className="border-0 bg-secondary/30 p-4 shadow-none">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Campo label="Rol" required>
                <select name="rol_nombre" required defaultValue="" className={clasesInput}>
                  <option value="" disabled>
                    Selecciona…
                  </option>
                  {listaRoles.map((r) => (
                    <option key={r.id} value={r.nombre}>
                      {nombresRol[r.nombre] ?? r.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Tienda">
                <select name="tienda_id" defaultValue="" className={clasesInput}>
                  <option value="">Sin tienda asignada</option>
                  {listaTiendas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Superior directo">
                <select name="superior_id" defaultValue="" className={clasesInput}>
                  <option value="">Sin superior directo</option>
                  {superioresPosibles.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre} ({nombresRol[u.roles?.nombre ?? ''] ?? u.roles?.nombre})
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
          </SeccionFormulario>

          {puedeVerLaboral && (
            <details className="rounded-lg border border-border">
              <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-semibold text-primary">
                + Datos laborales (opcional, solo admin/contabilidad)
              </summary>
              <SeccionFormulario icon={Wallet2} titulo="Datos laborales" className="mx-3 mb-3 border-0 bg-secondary/30 p-4 shadow-none">
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Campo label="DPI">
                      <input name="dpi" className={clasesInput} />
                    </Campo>
                    <Campo label="NIT">
                      <input name="nit_laboral" className={clasesInput} />
                    </Campo>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Campo label="Fecha de nacimiento">
                      <input name="fecha_nacimiento" type="date" className={clasesInput} />
                    </Campo>
                    <Campo label="Fecha de ingreso">
                      <input name="fecha_ingreso" type="date" className={clasesInput} />
                    </Campo>
                  </div>
                  <Campo label="Dirección">
                    <input name="direccion_laboral" className={clasesInput} />
                  </Campo>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Campo label="Contacto de emergencia">
                      <input name="contacto_emergencia_nombre" className={clasesInput} />
                    </Campo>
                    <Campo label="Teléfono de emergencia">
                      <input name="contacto_emergencia_telefono" className={clasesInput} />
                    </Campo>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Campo label="Tipo de contrato">
                      <select name="tipo_contrato" defaultValue="" className={clasesInput}>
                        <option value="">Selecciona…</option>
                        <option value="planilla">Planilla</option>
                        <option value="honorarios">Honorarios</option>
                        <option value="temporal">Temporal</option>
                        <option value="comision_pura">Comisión pura</option>
                      </select>
                    </Campo>
                    <Campo label="Salario base (GTQ)">
                      <input name="salario_base" type="number" step="0.01" min="0" className={clasesInput} />
                    </Campo>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Campo label="Banco">
                      <input name="banco_laboral" className={clasesInput} />
                    </Campo>
                    <Campo label="Cuenta bancaria">
                      <input name="cuenta_bancaria_laboral" className={clasesInput} />
                    </Campo>
                  </div>
                </div>
              </SeccionFormulario>
            </details>
          )}

          <div className="flex justify-end">
            <BotonPrimario>Crear usuario</BotonPrimario>
          </div>
        </form>
      </details>

      {listaUsuarios.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Users className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Aún no hay usuarios</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {listaUsuarios.map((u) => (
            <div key={u.id} className="rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {u.nombre}
                    {!u.activo && (
                      <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                        Desactivado
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {u.correo} · {nombresRol[u.roles?.nombre ?? ''] ?? u.roles?.nombre}
                    {u.tiendas?.nombre && ` · ${u.tiendas.nombre}`}
                  </p>
                </div>
                <Link
                  href={`/admin/usuarios/${u.id}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
                >
                  <UserCircle className="h-3.5 w-3.5" />
                  Ver perfil
                </Link>
                <form action={alternarActivoUsuario}>
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="activo" value={u.activo ? '1' : '0'} />
                  <button
                    type="submit"
                    className={
                      u.activo
                        ? 'rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10'
                        : 'rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary'
                    }
                  >
                    {u.activo ? 'Desactivar' : 'Reactivar'}
                  </button>
                </form>
              </div>
              <details>
                <summary className="cursor-pointer list-none border-t border-border px-4 py-2 text-xs font-semibold text-primary">
                  Editar rol, tienda y jerarquía
                </summary>
                <form action={actualizarUsuario} className="flex flex-wrap items-end gap-3 border-t border-border px-4 py-3">
                <input type="hidden" name="id" value={u.id} />
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Rol
                  <select name="rol_id" defaultValue={u.rol_id} className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
                    {listaRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {nombresRol[r.nombre] ?? r.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Tienda
                  <select name="tienda_id" defaultValue={u.tienda_id ?? ''} className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
                    <option value="">Sin tienda</option>
                    {listaTiendas.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Superior directo
                  <select name="superior_id" defaultValue={u.superior_id ?? ''} className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
                    <option value="">Sin superior</option>
                    {superioresPosibles
                      .filter((s) => s.id !== u.id)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre} ({nombresRol[s.roles?.nombre ?? ''] ?? s.roles?.nombre})
                        </option>
                      ))}
                  </select>
                </label>
                <BotonPrimario className="px-4 py-2">Guardar cambios</BotonPrimario>
                </form>
              </details>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
