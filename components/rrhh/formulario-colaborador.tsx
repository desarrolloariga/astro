import Link from 'next/link'
import { clasesCampo } from '@/lib/contabilidad-general'
import {
  DEPARTAMENTOS_GT,
  ESTADOS_CIVILES,
  ESTADOS_COLABORADOR,
  GENEROS,
  JORNADAS,
  LICENCIAS,
  MODALIDADES,
  TIPOS_CONTRATO,
  TIPOS_PLANILLA,
  type Colaborador,
} from '@/lib/rrhh'
import { guardarColaborador } from '@/app/(app)/rrhh/acciones'

type Opcion = { id: number; nombre: string }
export type CatalogosRrhh = {
  departamentos: Opcion[]
  areas: (Opcion & { departamento_id: number })[]
  puestos: Opcion[]
  tiendas: Opcion[]
  jefes: Opcion[]
  centros: { id: number; codigo: string; nombre: string }[]
  usuarios: Opcion[]
}

function Campo({ etiqueta, children, ancho = 1 }: { etiqueta: string; children: React.ReactNode; ancho?: 1 | 2 | 3 }) {
  return (
    <label className={`flex flex-col gap-1 text-xs font-semibold text-foreground ${ancho === 2 ? 'sm:col-span-2' : ancho === 3 ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
      {etiqueta}
      {children}
    </label>
  )
}

function Lista({ name, valor, opciones, vacio = '—' }: { name: string; valor: string | number | null | undefined; opciones: [string, string][]; vacio?: string }) {
  return (
    <select name={name} defaultValue={valor ?? ''} className={clasesCampo}>
      <option value="">{vacio}</option>
      {opciones.map(([v, e]) => (
        <option key={v} value={v}>
          {e}
        </option>
      ))}
    </select>
  )
}

export function FormularioColaborador({ c, cat }: { c?: Colaborador; cat: CatalogosRrhh }) {
  const t = (v: string | number | null | undefined) => (v == null ? '' : String(v))
  const ent = (o: Record<string, string>) => Object.entries(o)
  return (
    <form action={guardarColaborador} encType="multipart/form-data" className="flex flex-col gap-5">
      {c && <input type="hidden" name="id" value={c.id} />}

      <section className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        <p className="text-sm font-semibold sm:col-span-2 lg:col-span-3">1. Datos personales</p>
        <Campo etiqueta="Nombres">
          <input name="nombres" required defaultValue={t(c?.nombres)} className={clasesCampo} />
        </Campo>
        <Campo etiqueta="Apellidos">
          <input name="apellidos" required defaultValue={t(c?.apellidos)} className={clasesCampo} />
        </Campo>
        <Campo etiqueta="Fotografía">
          <input name="foto" type="file" accept="image/*" className="text-xs" />
        </Campo>
        <Campo etiqueta="DPI (13 dígitos)">
          <input name="dpi" inputMode="numeric" maxLength={15} defaultValue={t(c?.dpi)} className={`${clasesCampo} font-mono`} />
        </Campo>
        <Campo etiqueta="Lugar de emisión del DPI">
          <input name="dpi_lugar_emision" defaultValue={t(c?.dpi_lugar_emision)} className={clasesCampo} />
        </Campo>
        <Campo etiqueta="NIT">
          <input name="nit" defaultValue={t(c?.nit)} className={`${clasesCampo} font-mono`} />
        </Campo>
        <Campo etiqueta="Fecha de nacimiento">
          <input name="fecha_nacimiento" type="date" defaultValue={t(c?.fecha_nacimiento)} className={clasesCampo} />
        </Campo>
        <Campo etiqueta="Género">
          <Lista name="genero" valor={c?.genero} opciones={ent(GENEROS)} />
        </Campo>
        <Campo etiqueta="Estado civil">
          <Lista name="estado_civil" valor={c?.estado_civil} opciones={ent(ESTADOS_CIVILES)} />
        </Campo>
        <Campo etiqueta="Cantidad de hijos">
          <input name="hijos" type="number" min="0" defaultValue={t(c?.hijos)} className={clasesCampo} />
        </Campo>
        <Campo etiqueta="Nacionalidad">
          <input name="nacionalidad" defaultValue={c?.nacionalidad ?? 'Guatemalteca'} className={clasesCampo} />
        </Campo>
        <Campo etiqueta="Teléfono personal">
          <input name="telefono" defaultValue={t(c?.telefono)} className={clasesCampo} />
        </Campo>
        <Campo etiqueta="Dirección de residencia" ancho={2}>
          <input name="direccion" defaultValue={t(c?.direccion)} className={clasesCampo} />
        </Campo>
        <Campo etiqueta="Correo electrónico personal">
          <input name="correo_personal" type="email" defaultValue={t(c?.correo_personal)} className={clasesCampo} />
        </Campo>
        <Campo etiqueta="Departamento">
          <Lista name="departamento_geo" valor={c?.departamento_geo} opciones={DEPARTAMENTOS_GT.map((d) => [d, d])} />
        </Campo>
        <Campo etiqueta="Municipio">
          <input name="municipio" defaultValue={t(c?.municipio)} className={clasesCampo} />
        </Campo>
        <Campo etiqueta="Título de estudios obtenido">
          <input name="titulo_estudios" defaultValue={t(c?.titulo_estudios)} className={clasesCampo} />
        </Campo>
        <Campo etiqueta="Licencia de conducir (si aplica)">
          <Lista name="licencia_tipo" valor={c?.licencia_tipo} opciones={ent(LICENCIAS)} vacio="No tiene" />
        </Campo>
        <Campo etiqueta="Número de licencia">
          <input name="licencia_numero" defaultValue={t(c?.licencia_numero)} className={clasesCampo} />
        </Campo>
        <Campo etiqueta="Vencimiento de licencia">
          <input name="licencia_vence" type="date" defaultValue={t(c?.licencia_vence)} className={clasesCampo} />
        </Campo>
        <Campo etiqueta="Contacto de emergencia">
          <input name="emergencia_nombre" defaultValue={t(c?.emergencia_nombre)} className={clasesCampo} />
        </Campo>
        <Campo etiqueta="Teléfono de emergencia">
          <input name="emergencia_telefono" defaultValue={t(c?.emergencia_telefono)} className={clasesCampo} />
        </Campo>
        <Campo etiqueta="Parentesco">
          <input name="emergencia_parentesco" defaultValue={t(c?.emergencia_parentesco)} className={clasesCampo} />
        </Campo>
        <Campo etiqueta="Talla de camisa">
          <input name="talla_camisa" defaultValue={t(c?.talla_camisa)} placeholder="S, M, L, XL…" className={clasesCampo} />
        </Campo>
        <Campo etiqueta="Talla de pantalón">
          <input name="talla_pantalon" defaultValue={t(c?.talla_pantalon)} placeholder="30, 32…" className={clasesCampo} />
        </Campo>
        <Campo etiqueta="Talla de calzado">
          <input name="talla_calzado" defaultValue={t(c?.talla_calzado)} placeholder="38, 40…" className={clasesCampo} />
        </Campo>
      </section>

      <section className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        <p className="text-sm font-semibold sm:col-span-2 lg:col-span-3">2. Información de ingreso</p>
        <Campo etiqueta="Fecha de ingreso">
          <input name="fecha_ingreso" type="date" defaultValue={t(c?.fecha_ingreso)} className={clasesCampo} />
        </Campo>
        <Campo etiqueta="Departamento">
          <Lista name="departamento_id" valor={c?.departamento_id} opciones={cat.departamentos.map((d) => [String(d.id), d.nombre])} />
        </Campo>
        <Campo etiqueta="Área">
          <Lista
            name="area_id"
            valor={c?.area_id}
            opciones={cat.areas.map((a) => [String(a.id), `${cat.departamentos.find((d) => d.id === a.departamento_id)?.nombre ?? ''} · ${a.nombre}`])}
          />
        </Campo>
        <Campo etiqueta="Puesto">
          <Lista name="puesto_id" valor={c?.puesto_id} opciones={cat.puestos.map((p) => [String(p.id), p.nombre])} />
        </Campo>
        <Campo etiqueta="Jefe inmediato">
          <Lista name="jefe_id" valor={c?.jefe_id} opciones={cat.jefes.filter((j) => j.id !== c?.id).map((j) => [String(j.id), j.nombre])} />
        </Campo>
        <Campo etiqueta="Sucursal o ubicación">
          <Lista name="tienda_id" valor={c?.tienda_id} opciones={cat.tiendas.map((s) => [String(s.id), s.nombre])} />
        </Campo>
        <Campo etiqueta="Área de trabajo">
          <input name="area_trabajo" defaultValue={t(c?.area_trabajo)} placeholder="Ej. Taller, mostrador, bodega" className={clasesCampo} />
        </Campo>
        <Campo etiqueta="Tipo de contrato">
          <Lista name="tipo_contrato" valor={c?.tipo_contrato} opciones={ent(TIPOS_CONTRATO)} />
        </Campo>
        <Campo etiqueta="Jornada laboral">
          <Lista name="jornada" valor={c?.jornada} opciones={ent(JORNADAS)} />
        </Campo>
        <Campo etiqueta="Horario">
          <input name="horario" defaultValue={t(c?.horario)} placeholder="Ej. Lunes a viernes 8:00–17:00, sábado 8:00–12:00" className={clasesCampo} />
        </Campo>
        <Campo etiqueta="Modalidad de trabajo">
          <Lista name="modalidad" valor={c?.modalidad} opciones={ent(MODALIDADES)} />
        </Campo>
        <Campo etiqueta="Estado del colaborador">
          <select name="estado" defaultValue={c?.estado ?? 'periodo_prueba'} className={clasesCampo}>
            {Object.entries(ESTADOS_COLABORADOR)
              .filter(([v]) => v !== 'baja' || c?.estado === 'baja')
              .map(([v, e]) => (
                <option key={v} value={v}>
                  {e.etiqueta}
                </option>
              ))}
          </select>
        </Campo>
        <Campo etiqueta="Fin del período de prueba">
          <input name="fin_periodo_prueba" type="date" defaultValue={t(c?.fin_periodo_prueba)} className={clasesCampo} />
        </Campo>
        <Campo etiqueta="Planilla">
          <select name="tipo_planilla" defaultValue={c?.tipo_planilla ?? 'contrato'} className={clasesCampo}>
            {Object.entries(TIPOS_PLANILLA).map(([v, e]) => (
              <option key={v} value={v}>
                {e}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Centro de costo (contabilidad)">
          <Lista name="centro_costo_id" valor={c?.centro_costo_id} opciones={cat.centros.map((cc) => [String(cc.id), `${cc.codigo} · ${cc.nombre}`])} />
        </Campo>
        <Campo etiqueta="Afiliación IGSS">
          <input name="afiliacion_igss" defaultValue={t(c?.afiliacion_igss)} className={`${clasesCampo} font-mono`} />
        </Campo>
        <Campo etiqueta="Usuario del sistema (si usa ASTRO)">
          <Lista name="usuario_id" valor={c?.usuario_id} opciones={cat.usuarios.map((u) => [String(u.id), u.nombre])} vacio="No usa el sistema" />
        </Campo>
        <Campo etiqueta="Notas" ancho={3}>
          <textarea name="notas" rows={2} defaultValue={t(c?.notas)} className={clasesCampo} />
        </Campo>
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          {c ? 'Guardar expediente' : 'Crear colaborador'}
        </button>
        <Link href={c ? `/rrhh/${c.id}` : '/rrhh'} className="text-sm text-muted-foreground hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  )
}
