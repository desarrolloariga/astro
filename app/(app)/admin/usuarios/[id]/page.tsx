import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Mail, Phone, Store, Users, History, IdCard } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearFecha, formatearPrecio } from '@/lib/formato'
import { asignarSuperior, actualizarDatosLaborales } from '../acciones'
import { Campo, BotonPrimario, clasesInput as clasesCampo } from '@/components/app/formulario'

const nombresTipoContrato: Record<string, string> = {
  planilla: 'Planilla',
  honorarios: 'Honorarios',
  temporal: 'Temporal',
  comision_pura: 'Comisión pura',
}

export const metadata = { title: 'Perfil de usuario — ASTRO' }

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

type Usuario = {
  id: number
  nombre: string
  correo: string
  telefono: string | null
  activo: boolean
  superior_id: number | null
  fecha_creacion: string
  roles: { nombre: string } | null
  tiendas: { nombre: string } | null
}

type Cambio = { id: number; superior_id: number | null; fecha_inicio: string; fecha_fin: string | null }
type DatosLaborales = {
  dpi: string | null
  nit: string | null
  fecha_nacimiento: string | null
  direccion: string | null
  contacto_emergencia_nombre: string | null
  contacto_emergencia_telefono: string | null
  fecha_ingreso: string | null
  tipo_contrato: string | null
  salario_base: number | null
  banco: string | null
  cuenta_bancaria: string | null
}

export default async function PerfilUsuarioPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if (!(await tienePermiso('usuarios', 'ver'))) redirect('/inicio')
  const puedeEditar = await tienePermiso('usuarios', 'editar')
  const puedeVerLaboral = await tienePermiso('usuarios', 'ver_laboral')
  const puedeEditarLaboral = await tienePermiso('usuarios', 'editar_laboral')

  const { id } = await params
  const supabase = await createClient()

  const [{ data: pieza }, { data: todosData }, { data: historialData }, { data: laboralData }] = await Promise.all([
    supabase
      .from('usuarios')
      .select('id, nombre, correo, telefono, activo, superior_id, fecha_creacion, roles ( nombre ), tiendas ( nombre )')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('usuarios').select('id, nombre, superior_id, activo, roles ( nombre )'),
    supabase
      .from('historial_jerarquia')
      .select('id, superior_id, fecha_inicio, fecha_fin')
      .eq('usuario_id', id)
      .order('fecha_inicio', { ascending: false }),
    puedeVerLaboral
      ? supabase
          .from('usuarios_datos_laborales')
          .select(
            'dpi, nit, fecha_nacimiento, direccion, contacto_emergencia_nombre, contacto_emergencia_telefono, fecha_ingreso, tipo_contrato, salario_base, banco, cuenta_bancaria',
          )
          .eq('usuario_id', id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const usuario = pieza as unknown as Usuario | null
  if (!usuario) notFound()
  const laboral = laboralData as DatosLaborales | null

  const todos = (todosData ?? []) as unknown as (Usuario & { id: number })[]
  const historial = (historialData ?? []) as Cambio[]
  const mapaNombres = new Map(todos.map((u) => [u.id, u.nombre]))

  const superior = usuario.superior_id ? todos.find((u) => u.id === usuario.superior_id) : null
  const reportesDirectos = todos.filter((u) => u.superior_id === usuario.id)

  function contarDescendientes(idRaiz: number, visitados: Set<number> = new Set()): number {
    let total = 0
    for (const u of todos) {
      if (u.superior_id === idRaiz && !visitados.has(u.id)) {
        visitados.add(u.id)
        total += 1 + contarDescendientes(u.id, visitados)
      }
    }
    return total
  }
  const totalRed = contarDescendientes(usuario.id)

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
      <Link
        href="/admin/usuarios/jerarquia"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a la jerarquía
      </Link>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-1 flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-foreground">{usuario.nombre}</h1>
          {!usuario.activo && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
              Desactivado
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {nombresRol[usuario.roles?.nombre ?? ''] ?? usuario.roles?.nombre}
        </p>

        <div className="mt-4 flex flex-col gap-1.5 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <Mail className="h-3.5 w-3.5" /> {usuario.correo}
          </span>
          {usuario.telefono && (
            <span className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5" /> {usuario.telefono}
            </span>
          )}
          {usuario.tiendas?.nombre && (
            <span className="flex items-center gap-2">
              <Store className="h-3.5 w-3.5" /> {usuario.tiendas.nombre}
            </span>
          )}
          <span className="text-xs">Alta: {formatearFecha(usuario.fecha_creacion)}</span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
          <Users className="h-4 w-4 text-primary" />
          Posición en la jerarquía
        </h2>

        <p className="text-sm text-foreground">
          Reporta a:{' '}
          {superior ? (
            <Link href={`/admin/usuarios/${superior.id}`} className="font-semibold text-primary hover:underline">
              {superior.nombre}
            </Link>
          ) : (
            <span className="text-muted-foreground">nadie (raíz de su rama)</span>
          )}
        </p>
        <p className="mt-1 text-sm text-foreground">
          Red: <span className="font-semibold">{reportesDirectos.length}</span> reporte
          {reportesDirectos.length !== 1 ? 's' : ''} directo{reportesDirectos.length !== 1 ? 's' : ''} ·{' '}
          <span className="font-semibold">{totalRed}</span> en toda su red
        </p>

        {puedeEditar && (
          <form action={asignarSuperior} className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={usuario.id} />
            <select
              name="superior_id"
              defaultValue={usuario.superior_id ?? ''}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">Sin superior</option>
              {todos
                .filter((u) => u.id !== usuario.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
            </select>
            <BotonPrimario className="px-4 py-2">Cambiar superior</BotonPrimario>
          </form>
        )}

        {reportesDirectos.length > 0 && (
          <div className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Reportes directos
            </p>
            {reportesDirectos.map((r) => (
              <Link
                key={r.id}
                href={`/admin/usuarios/${r.id}`}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary"
              >
                <span>{r.nombre}</span>
                <span className="text-xs text-muted-foreground">
                  {nombresRol[r.roles?.nombre ?? ''] ?? r.roles?.nombre}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {puedeVerLaboral && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
            <IdCard className="h-4 w-4 text-primary" />
            Datos laborales
          </h2>

          {laboral ? (
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              {laboral.dpi && (
                <p>
                  <span className="text-muted-foreground">DPI:</span>{' '}
                  <span className="font-medium text-foreground">{laboral.dpi}</span>
                </p>
              )}
              {laboral.nit && (
                <p>
                  <span className="text-muted-foreground">NIT:</span>{' '}
                  <span className="font-medium text-foreground">{laboral.nit}</span>
                </p>
              )}
              {laboral.fecha_nacimiento && (
                <p>
                  <span className="text-muted-foreground">Nacimiento:</span>{' '}
                  <span className="font-medium text-foreground">{formatearFecha(laboral.fecha_nacimiento)}</span>
                </p>
              )}
              {laboral.fecha_ingreso && (
                <p>
                  <span className="text-muted-foreground">Ingreso:</span>{' '}
                  <span className="font-medium text-foreground">{formatearFecha(laboral.fecha_ingreso)}</span>
                </p>
              )}
              {laboral.direccion && (
                <p className="sm:col-span-2">
                  <span className="text-muted-foreground">Dirección:</span>{' '}
                  <span className="font-medium text-foreground">{laboral.direccion}</span>
                </p>
              )}
              {(laboral.contacto_emergencia_nombre || laboral.contacto_emergencia_telefono) && (
                <p className="sm:col-span-2">
                  <span className="text-muted-foreground">Emergencia:</span>{' '}
                  <span className="font-medium text-foreground">
                    {laboral.contacto_emergencia_nombre}
                    {laboral.contacto_emergencia_telefono && ` · ${laboral.contacto_emergencia_telefono}`}
                  </span>
                </p>
              )}
              {laboral.tipo_contrato && (
                <p>
                  <span className="text-muted-foreground">Contrato:</span>{' '}
                  <span className="font-medium text-foreground">
                    {nombresTipoContrato[laboral.tipo_contrato] ?? laboral.tipo_contrato}
                  </span>
                </p>
              )}
              {laboral.salario_base != null && (
                <p>
                  <span className="text-muted-foreground">Salario base:</span>{' '}
                  <span className="font-medium text-foreground">{formatearPrecio(laboral.salario_base)}</span>
                </p>
              )}
              {(laboral.banco || laboral.cuenta_bancaria) && (
                <p className="sm:col-span-2">
                  <span className="text-muted-foreground">Banco:</span>{' '}
                  <span className="font-medium text-foreground">
                    {laboral.banco}
                    {laboral.cuenta_bancaria && ` · ${laboral.cuenta_bancaria}`}
                  </span>
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin datos laborales registrados todavía.</p>
          )}

          {puedeEditarLaboral && (
            <details className="mt-4 border-t border-border pt-3">
              <summary className="cursor-pointer list-none text-xs font-semibold text-primary">
                Editar datos laborales
              </summary>
              <form action={actualizarDatosLaborales} className="mt-3 flex flex-col gap-4">
                <input type="hidden" name="usuario_id" value={usuario.id} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Campo label="DPI">
                    <input name="dpi" defaultValue={laboral?.dpi ?? ''} className={clasesCampo} />
                  </Campo>
                  <Campo label="NIT">
                    <input name="nit_laboral" defaultValue={laboral?.nit ?? ''} className={clasesCampo} />
                  </Campo>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Campo label="Fecha de nacimiento">
                    <input
                      name="fecha_nacimiento"
                      type="date"
                      defaultValue={laboral?.fecha_nacimiento ?? ''}
                      className={clasesCampo}
                    />
                  </Campo>
                  <Campo label="Fecha de ingreso">
                    <input
                      name="fecha_ingreso"
                      type="date"
                      defaultValue={laboral?.fecha_ingreso ?? ''}
                      className={clasesCampo}
                    />
                  </Campo>
                </div>
                <Campo label="Dirección">
                  <input name="direccion_laboral" defaultValue={laboral?.direccion ?? ''} className={clasesCampo} />
                </Campo>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Campo label="Contacto de emergencia">
                    <input
                      name="contacto_emergencia_nombre"
                      defaultValue={laboral?.contacto_emergencia_nombre ?? ''}
                      className={clasesCampo}
                    />
                  </Campo>
                  <Campo label="Teléfono de emergencia">
                    <input
                      name="contacto_emergencia_telefono"
                      defaultValue={laboral?.contacto_emergencia_telefono ?? ''}
                      className={clasesCampo}
                    />
                  </Campo>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Campo label="Tipo de contrato">
                    <select name="tipo_contrato" defaultValue={laboral?.tipo_contrato ?? ''} className={clasesCampo}>
                      <option value="">Selecciona…</option>
                      <option value="planilla">Planilla</option>
                      <option value="honorarios">Honorarios</option>
                      <option value="temporal">Temporal</option>
                      <option value="comision_pura">Comisión pura</option>
                    </select>
                  </Campo>
                  <Campo label="Salario base (GTQ)">
                    <input
                      name="salario_base"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={laboral?.salario_base ?? ''}
                      className={clasesCampo}
                    />
                  </Campo>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Campo label="Banco">
                    <input name="banco_laboral" defaultValue={laboral?.banco ?? ''} className={clasesCampo} />
                  </Campo>
                  <Campo label="Cuenta bancaria">
                    <input
                      name="cuenta_bancaria_laboral"
                      defaultValue={laboral?.cuenta_bancaria ?? ''}
                      className={clasesCampo}
                    />
                  </Campo>
                </div>
                <div>
                  <BotonPrimario>Guardar datos laborales</BotonPrimario>
                </div>
              </form>
            </details>
          )}
        </div>
      )}

      {historial.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
            <History className="h-4 w-4 text-primary" />
            Historial de jerarquía
          </h2>
          <div className="flex flex-col gap-2">
            {historial.map((h) => (
              <div key={h.id} className="text-xs text-muted-foreground">
                Desde {formatearFecha(h.fecha_inicio)}
                {h.fecha_fin && ` hasta ${formatearFecha(h.fecha_fin)}`}: reportaba a{' '}
                <span className="font-medium text-foreground">
                  {h.superior_id ? (mapaNombres.get(h.superior_id) ?? 'usuario eliminado') : 'nadie'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}
