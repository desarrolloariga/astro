import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ListTree, Pencil, Plus, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { hoyGuatemala } from '@/lib/contabilidad'
import {
  TIPOS_CUENTA,
  clasesCampo,
  etiquetaTipoCuenta,
  montoContable,
  siguienteCodigo,
} from '@/lib/contabilidad-general'
import { BotonConfirmar } from '@/components/app/boton-confirmar'
import { Encabezado, Mensajes } from '@/components/contabilidad/comunes'
import { cambiarEstadoCuenta, eliminarCuenta, guardarCuenta } from './acciones'

export const metadata = { title: 'Nomenclatura contable — ASTRO' }

type Cuenta = {
  id: number
  codigo: string
  nombre: string
  tipo: string
  naturaleza: 'deudora' | 'acreedora'
  es_detalle: boolean
  padre_id: number | null
  nivel: number
  activo: boolean
  descripcion: string | null
  exige_centro_costo: boolean
}

const compararCodigo = (a: string, b: string) => {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1)
    if (d !== 0) return d
  }
  return 0
}

export default async function NomenclaturaPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; q?: string; tipo?: string; nivel?: string; editar?: string; padre?: string; nueva?: string }>
}) {
  const sp = await searchParams
  const hoy = hoyGuatemala()
  const supabase = await createClient()
  const [puedeVer, puedeConfigurar, { data: cuentasData }, { data: saldosData }] = await Promise.all([
    tienePermiso('contabilidad', 'ver'),
    tienePermiso('contabilidad', 'configurar'),
    supabase
      .from('cuentas_contables')
      .select('id, codigo, nombre, tipo, naturaleza, es_detalle, padre_id, nivel, activo, descripcion, exige_centro_costo'),
    supabase.rpc('fn_balance_saldos', { p_desde: `${hoy.slice(0, 4)}-01-01`, p_hasta: hoy, p_nivel: 4, p_centro_costo_id: null }),
  ])
  if (!puedeVer) redirect('/inicio')

  const cuentas = ((cuentasData ?? []) as Cuenta[]).sort((a, b) => compararCodigo(a.codigo, b.codigo))
  const saldos = new Map<number, number>(
    ((saldosData ?? []) as { cuenta_id: number; saldo_final: number }[]).map((s) => [s.cuenta_id, Number(s.saldo_final)]),
  )
  const porId = new Map(cuentas.map((c) => [c.id, c]))

  const q = (sp.q ?? '').trim().toLowerCase()
  const nivelMax = Math.min(4, Math.max(1, Number(sp.nivel) || 4))
  const visibles = cuentas.filter(
    (c) =>
      c.nivel <= nivelMax &&
      (!sp.tipo || c.tipo === sp.tipo) &&
      (!q || c.codigo.startsWith(q) || c.nombre.toLowerCase().includes(q)),
  )

  // Formulario: editar una cuenta, crear subcuenta de una Madre o crear cuenta de primer nivel.
  const editando = sp.editar ? porId.get(Number(sp.editar)) : undefined
  const padre = sp.padre ? porId.get(Number(sp.padre)) : undefined
  const codigoSugerido = padre
    ? siguienteCodigo(padre.codigo, cuentas.filter((c) => c.padre_id === padre.id).map((c) => c.codigo))
    : ''
  const mostrarFormulario = puedeConfigurar && (Boolean(editando) || Boolean(padre) || sp.nueva === '1')
  const tipoFormulario = editando?.tipo ?? padre?.tipo ?? 'activo'
  const naturalezaFormulario =
    editando?.naturaleza ?? padre?.naturaleza ?? (['activo', 'costo', 'gasto'].includes(tipoFormulario) ? 'deudora' : 'acreedora')
  const conHijos = editando ? cuentas.some((c) => c.padre_id === editando.id) : false

  const filtro = (extra: Record<string, string>) => {
    const p = new URLSearchParams()
    if (sp.q) p.set('q', sp.q)
    if (sp.tipo) p.set('tipo', sp.tipo)
    if (sp.nivel) p.set('nivel', sp.nivel)
    Object.entries(extra).forEach(([k, v]) => p.set(k, v))
    return `/contabilidad/nomenclatura?${p.toString()}`
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={ListTree}
        titulo="Nomenclatura contable"
        descripcion="Catálogo de cuentas. Las cuentas Madre acumulan el saldo de sus subcuentas; solo las cuentas de Detalle reciben partidas. Costos y gastos piden centro de costo."
      >
        {puedeConfigurar && (
          <Link
            href={filtro({ nueva: '1' })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Cuenta de primer nivel
          </Link>
        )}
      </Encabezado>

      <Mensajes ok={sp.ok} error={sp.error} />

      {mostrarFormulario && (
        <form action={guardarCuenta} className="grid grid-cols-1 gap-3 rounded-xl border border-primary/40 bg-card p-4 sm:grid-cols-2 lg:grid-cols-6">
          <p className="text-sm font-semibold text-foreground sm:col-span-2 lg:col-span-6">
            {editando
              ? `Editar ${editando.codigo} ${editando.nombre}`
              : padre
                ? `Nueva subcuenta de ${padre.codigo} ${padre.nombre}`
                : 'Nueva cuenta de primer nivel'}
          </p>
          {editando && <input type="hidden" name="id" value={editando.id} />}
          <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
            Código
            <input
              name="codigo"
              required
              defaultValue={editando?.codigo ?? codigoSugerido}
              placeholder="1.01.01.001"
              className={cn(clasesCampo, 'font-mono')}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-foreground sm:col-span-1 lg:col-span-2">
            Nombre
            <input name="nombre" required defaultValue={editando?.nombre ?? ''} className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
            Tipo
            <select
              name="tipo"
              defaultValue={tipoFormulario}
              disabled={Boolean(padre) || Boolean(editando && editando.nivel > 1)}
              className={clasesCampo}
            >
              {TIPOS_CUENTA.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.digito} · {t.etiqueta}
                </option>
              ))}
            </select>
            {(padre || (editando && editando.nivel > 1)) && <input type="hidden" name="tipo" value={tipoFormulario} />}
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
            Naturaleza
            <select name="naturaleza" defaultValue={naturalezaFormulario} className={clasesCampo}>
              <option value="deudora">Deudora</option>
              <option value="acreedora">Acreedora</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
            Clase
            <select
              name="es_detalle"
              defaultValue={editando ? (editando.es_detalle ? 'detalle' : 'madre') : padre && padre.nivel >= 3 ? 'detalle' : 'madre'}
              disabled={conHijos}
              className={clasesCampo}
            >
              <option value="madre">Madre (acumula)</option>
              <option value="detalle">Detalle (recibe partidas)</option>
            </select>
            {conHijos && <input type="hidden" name="es_detalle" value="madre" />}
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-foreground sm:col-span-2 lg:col-span-4">
            Descripción (opcional)
            <input name="descripcion" defaultValue={editando?.descripcion ?? ''} className={clasesCampo} />
          </label>
          {editando && (
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
              <input type="checkbox" name="activo" defaultChecked={editando.activo} className="h-4 w-4" />
              Activa
            </label>
          )}
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
            <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Guardar
            </button>
            <Link href={filtro({})} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
              Cancelar
            </Link>
          </div>
        </form>
      )}

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-semibold text-foreground">
          Buscar
          <span className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input name="q" defaultValue={sp.q ?? ''} placeholder="Código o nombre" className={cn(clasesCampo, 'pl-8')} />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Tipo
          <select name="tipo" defaultValue={sp.tipo ?? ''} className={clasesCampo}>
            <option value="">Todos</option>
            {TIPOS_CUENTA.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Mostrar hasta nivel
          <select name="nivel" defaultValue={String(nivelMax)} className={clasesCampo}>
            <option value="1">1 · Grupo</option>
            <option value="2">2 · Subgrupo</option>
            <option value="3">3 · Mayor</option>
            <option value="4">4 · Detalle</option>
          </select>
        </label>
        <button type="submit" className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
          Filtrar
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Cuenta</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Clase</th>
              <th className="px-3 py-2 text-right">Saldo al {hoy.split('-').reverse().join('/')}</th>
              {puedeConfigurar && <th className="px-3 py-2 text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  {cuentas.length === 0
                    ? 'Aún no hay cuentas. Corre la migración de nomenclatura base o crea la primera cuenta.'
                    : 'Ninguna cuenta coincide con el filtro.'}
                </td>
              </tr>
            )}
            {visibles.map((c) => {
              const saldo = saldos.get(c.id) ?? 0
              const saldoNatural = c.naturaleza === 'deudora' ? saldo : -saldo
              return (
                <tr
                  key={c.id}
                  id={`c-${c.codigo}`}
                  className={cn('border-b border-border/60 last:border-0', !c.es_detalle && 'bg-muted/20', !c.activo && 'opacity-50')}
                >
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-muted-foreground">{c.codigo}</td>
                  <td className="px-3 py-1.5">
                    <span
                      style={{ paddingLeft: `${(c.nivel - 1) * 1.1}rem` }}
                      className={cn('block', !c.es_detalle ? 'font-semibold text-foreground' : 'text-foreground')}
                    >
                      {c.nombre}
                      {!c.activo && <span className="ml-2 text-xs text-muted-foreground">(inactiva)</span>}
                      {c.exige_centro_costo && c.es_detalle && (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">CC</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{etiquetaTipoCuenta(c.tipo)}</td>
                  <td className="px-3 py-1.5 text-xs">{c.es_detalle ? 'Detalle' : 'Madre'}</td>
                  <td className={cn('whitespace-nowrap px-3 py-1.5 text-right tabular-nums', !c.es_detalle && 'font-semibold', saldoNatural < 0 && 'text-destructive')}>
                    {saldo === 0 ? '—' : montoContable(saldoNatural)}
                  </td>
                  {puedeConfigurar && (
                    <td className="whitespace-nowrap px-3 py-1.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!c.es_detalle && c.nivel < 4 && (
                          <Link href={filtro({ padre: String(c.id) })} title="Agregar subcuenta" className="rounded p-1 text-primary hover:bg-primary/10">
                            <Plus className="h-4 w-4" />
                          </Link>
                        )}
                        <Link href={filtro({ editar: String(c.id) })} title="Editar" className="rounded p-1 text-muted-foreground hover:bg-muted">
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <form action={cambiarEstadoCuenta}>
                          <input type="hidden" name="id" value={c.id} />
                          <button type="submit" className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted">
                            {c.activo ? 'Desactivar' : 'Activar'}
                          </button>
                        </form>
                        {saldo === 0 && (
                          <form action={eliminarCuenta}>
                            <input type="hidden" name="id" value={c.id} />
                            <BotonConfirmar
                              mensaje={`¿Eliminar la cuenta ${c.codigo} ${c.nombre}? Solo es posible si nunca tuvo movimientos.`}
                              className="rounded px-1.5 py-1 text-xs text-destructive hover:bg-destructive/10"
                            >
                              Eliminar
                            </BotonConfirmar>
                          </form>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Saldos en quetzales, en su naturaleza (deudora o acreedora). Ingresos, costos y gastos muestran lo acumulado del año.
        {' '}
        {cuentas.filter((c) => c.es_detalle).length} cuentas de detalle · {cuentas.filter((c) => !c.es_detalle).length} cuentas madre.
      </p>
    </main>
  )
}
