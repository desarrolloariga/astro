import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Settings2, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { clasesCampo } from '@/lib/contabilidad-general'
import { BotonConfirmar } from '@/components/app/boton-confirmar'
import { Encabezado, Mensajes } from '@/components/contabilidad/comunes'
import { cambiarAutomatica, generarApertura, guardarEmpresaContable, guardarMapeo } from './acciones'

export const metadata = { title: 'Datos contables — ASTRO' }

type Empresa = {
  razon_social: string
  nombre_comercial: string | null
  nit: string
  direccion: string
  regimen_iva: 'general' | 'pequeno_contribuyente'
  tasa_impuesto: number
  fecha_inicio_contable: string | null
  contabilizacion_automatica: boolean
  contador_nombre: string | null
  contador_registro: string | null
}

type Evento = {
  clave: string
  grupo: string
  descripcion: string
  cuenta_id: number | null
  centro_costo_id: number | null
  requiere_cuenta: boolean
  orden: number
}

type Cuenta = { id: number; codigo: string; nombre: string; tipo: string }

const PESTANAS = [
  { valor: 'datos', etiqueta: 'Empresa' },
  { valor: 'mapeo', etiqueta: 'Mapeo de cuentas' },
  { valor: 'automatica', etiqueta: 'Partidas automáticas' },
] as const

export default async function ConfiguracionContablePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; tab?: string }>
}) {
  const sp = await searchParams
  const tab = PESTANAS.some((p) => p.valor === sp.tab) ? (sp.tab as string) : 'datos'
  const supabase = await createClient()
  const [puedeVer, puedeConfigurar, { data }, { data: eventosData }, { data: cuentasData }, { data: centrosData }, { data: bancosData }, { data: aperturaData }] =
    await Promise.all([
      tienePermiso('contabilidad', 'ver'),
      tienePermiso('contabilidad', 'configurar'),
      supabase.from('empresa_contable').select('*').eq('id', 1).maybeSingle(),
      supabase.from('config_contable_eventos').select('*').order('orden'),
      supabase.from('cuentas_contables').select('id, codigo, nombre, tipo').eq('es_detalle', true).eq('activo', true).order('codigo'),
      supabase.from('centros_costo').select('id, codigo, nombre').eq('activo', true).order('codigo'),
      supabase.from('cuentas_bancarias').select('id, nombre, banco, activa, cuenta_contable_id').order('nombre'),
      supabase
        .from('partidas')
        .select('id, estado')
        .eq('origen', 'apertura')
        .neq('estado', 'anulada')
        .is('revertida_por_id', null)
        .limit(1)
        .maybeSingle(),
    ])
  if (!puedeVer) redirect('/inicio')
  const e = data as Empresa | null
  const eventos = (eventosData ?? []) as Evento[]
  const cuentas = (cuentasData ?? []) as Cuenta[]
  const centros = (centrosData ?? []) as { id: number; codigo: string; nombre: string }[]
  const bancos = (bancosData ?? []) as { id: number; nombre: string; banco: string | null; activa: boolean; cuenta_contable_id: number | null }[]
  const apertura = aperturaData as { id: number; estado: string } | null
  const faltantes = eventos.filter((ev) => ev.requiere_cuenta && !ev.cuenta_id)
  const bancosSinCuenta = bancos.filter((b) => b.activa && !b.cuenta_contable_id)
  const grupos = [...new Set(eventos.map((ev) => ev.grupo))]
  const cuentaPorId = new Map(cuentas.map((c) => [c.id, c]))

  const campo = (nombre: keyof Empresa, etiqueta: string, opciones: { requerido?: boolean; ayuda?: string; tipo?: string } = {}) => (
    <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
      {etiqueta}
      <input
        name={nombre}
        type={opciones.tipo ?? 'text'}
        step={opciones.tipo === 'number' ? '0.01' : undefined}
        required={opciones.requerido}
        disabled={!puedeConfigurar}
        defaultValue={(e?.[nombre] as string | number | null) ?? ''}
        className={clasesCampo}
      />
      {opciones.ayuda && <span className="font-normal text-muted-foreground">{opciones.ayuda}</span>}
    </label>
  )

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={Settings2}
        titulo="Datos contables"
        descripcion="Datos de la empresa para reportes y libros, cuentas que usa cada operación del sistema y activación de las partidas automáticas."
      />

      <nav className="flex gap-1 overflow-x-auto border-b border-border">
        {PESTANAS.map((p) => (
          <Link
            key={p.valor}
            href={`/contabilidad/configuracion?tab=${p.valor}`}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold',
              tab === p.valor ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {p.etiqueta}
            {p.valor === 'mapeo' && faltantes.length + bancosSinCuenta.length > 0 && (
              <span className="ml-1.5 rounded-full bg-destructive/15 px-1.5 text-xs text-destructive">{faltantes.length + bancosSinCuenta.length}</span>
            )}
          </Link>
        ))}
      </nav>

      <Mensajes ok={sp.ok} error={sp.error} />

      {!e ? (
        <p className="text-sm text-muted-foreground">Corre la migración del núcleo contable para configurar los datos.</p>
      ) : tab === 'datos' ? (
        <form action={guardarEmpresaContable} className="flex flex-col gap-6">
          <input type="hidden" name="fecha_inicio_contable" value={e.fecha_inicio_contable ?? ''} />
          <section className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
            <p className="text-sm font-semibold text-foreground sm:col-span-2">Empresa</p>
            {campo('razon_social', 'Razón social', { requerido: true, ayuda: 'Aparece en la primera línea de cada reporte y libro.' })}
            {campo('nombre_comercial', 'Nombre comercial')}
            {campo('nit', 'NIT', { requerido: true })}
            {campo('direccion', 'Dirección fiscal', { requerido: true })}
          </section>

          <section className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
            <p className="text-sm font-semibold text-foreground sm:col-span-2">Régimen tributario</p>
            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
              Régimen de IVA
              <select name="regimen_iva" defaultValue={e.regimen_iva} disabled={!puedeConfigurar} className={clasesCampo}>
                <option value="general">Régimen general (IVA 12 %)</option>
                <option value="pequeno_contribuyente">Pequeño contribuyente (5 % sobre ingresos)</option>
              </select>
              <span className="font-normal text-muted-foreground">
                General: el impuesto de las ventas va a IVA débito y el de las compras a IVA crédito. Pequeño contribuyente: el
                impuesto es un gasto y las compras se registran con su impuesto incluido en el costo.
              </span>
            </label>
            {campo('tasa_impuesto', 'Tasa del impuesto (%)', {
              requerido: true,
              tipo: 'number',
              ayuda: 'Referencia para reportes. El impuesto de cada venta usa el porcentaje que tenía la pieza al venderse.',
            })}
          </section>

          <section className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
            <p className="text-sm font-semibold text-foreground sm:col-span-2">Contador</p>
            {campo('contador_nombre', 'Nombre del contador')}
            {campo('contador_registro', 'Número de registro')}
          </section>

          {puedeConfigurar && (
            <div>
              <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                Guardar datos contables
              </button>
            </div>
          )}
        </form>
      ) : tab === 'mapeo' ? (
        <form action={guardarMapeo} className="flex flex-col gap-6">
          <p className="text-sm text-muted-foreground">
            Cuenta de detalle (y centro de costo, en costos y gastos) que usa cada operación al generar su partida automática. Viene
            precargado con la nomenclatura base; cámbialo si el contador usa otras cuentas.
          </p>
          {grupos.map((grupo) => (
            <section key={grupo} className="overflow-x-auto rounded-xl border border-border bg-card">
              <p className="border-b border-border px-4 py-2.5 text-sm font-semibold text-foreground">{grupo}</p>
              <table className="w-full min-w-[720px] text-sm">
                <tbody>
                  {eventos
                    .filter((ev) => ev.grupo === grupo)
                    .map((ev) => {
                      const cuenta = ev.cuenta_id ? cuentaPorId.get(ev.cuenta_id) : undefined
                      const llevaCc = !ev.requiere_cuenta || ['costo', 'gasto', 'ingreso'].includes(cuenta?.tipo ?? '')
                      return (
                        <tr key={ev.clave} className="border-b border-border/60 last:border-0">
                          <td className="w-2/5 px-4 py-2">
                            <input type="hidden" name="clave" value={ev.clave} />
                            <span className={cn('text-foreground', ev.requiere_cuenta && !ev.cuenta_id && 'font-semibold text-destructive')}>
                              {ev.descripcion}
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            {ev.requiere_cuenta && (
                              <select
                                name={`cuenta_${ev.clave}`}
                                defaultValue={ev.cuenta_id ?? ''}
                                disabled={!puedeConfigurar}
                                className={cn(clasesCampo, 'py-1.5', !ev.cuenta_id && 'border-destructive')}
                              >
                                <option value="">— Sin cuenta —</option>
                                {cuentas.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.codigo} {c.nombre}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="w-48 px-2 py-2">
                            {llevaCc ? (
                              <select
                                name={`cc_${ev.clave}`}
                                defaultValue={ev.centro_costo_id ?? ''}
                                disabled={!puedeConfigurar}
                                className={cn(clasesCampo, 'py-1.5')}
                              >
                                <option value="">{ev.requiere_cuenta ? 'Centro según la venta' : 'Sin centro'}</option>
                                {centros.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.codigo} · {c.nombre}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-xs text-muted-foreground">Sin centro (balance)</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </section>
          ))}

          <section className="overflow-x-auto rounded-xl border border-border bg-card">
            <p className="border-b border-border px-4 py-2.5 text-sm font-semibold text-foreground">Cuentas bancarias</p>
            {bancos.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">
                No hay cuentas bancarias. Al crearlas en Bancos se les asigna su cuenta contable automáticamente.
              </p>
            ) : (
              <table className="w-full min-w-[560px] text-sm">
                <tbody>
                  {bancos.map((b) => (
                    <tr key={b.id} className={cn('border-b border-border/60 last:border-0', !b.activa && 'opacity-50')}>
                      <td className="w-2/5 px-4 py-2">
                        <input type="hidden" name="cuenta_bancaria_id" value={b.id} />
                        {b.nombre}
                        {b.banco && <span className="ml-1 text-xs text-muted-foreground">· {b.banco}</span>}
                      </td>
                      <td className="px-2 py-2">
                        <select
                          name={`banco_${b.id}`}
                          defaultValue={b.cuenta_contable_id ?? ''}
                          disabled={!puedeConfigurar}
                          className={cn(clasesCampo, 'py-1.5', b.activa && !b.cuenta_contable_id && 'border-destructive')}
                        >
                          <option value="">— Sin cuenta —</option>
                          {cuentas
                            .filter((c) => c.codigo.startsWith('1.01.0'))
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.codigo} {c.nombre}
                              </option>
                            ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {puedeConfigurar && (
            <div>
              <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                Guardar mapeo
              </button>
            </div>
          )}
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <section
            className={cn(
              'flex flex-col gap-3 rounded-xl border p-4',
              e.contabilizacion_automatica ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
            )}
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Zap className="h-4 w-4 text-primary" />
              {e.contabilizacion_automatica ? 'Partidas automáticas activas' : 'Partidas automáticas apagadas'}
            </p>
            {e.contabilizacion_automatica ? (
              <p className="text-sm text-muted-foreground">
                Desde el {e.fecha_inicio_contable?.split('-').reverse().join('/')}, cada venta pagada, cobro confirmado, movimiento de
                la Billetera, gasto, movimiento bancario, compra recibida, recepción de metal, liquidación aprobada y premio entregado
                genera su partida. Si alguna no se puede contabilizar (falta una cuenta, mes cerrado), la operación sigue normal y la
                partida queda en{' '}
                <Link href="/contabilidad/pendientes" className="font-semibold text-primary hover:underline">
                  Pendientes de contabilizar
                </Link>
                .
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                <li>Al activarlas por primera vez, la contabilidad arranca hoy.</li>
                <li>
                  Se genera una partida de apertura en borrador con los saldos de este momento: bancos, inventario a costo, premios,
                  cobros por depositar, anticipos, Billetera, proveedores, acreedores y comisiones por pagar.
                </li>
                <li>La diferencia queda en Ajustes de apertura, para que el contador la reclasifique a capital y resultados.</li>
                <li>Mientras estén apagadas, las operaciones no generan partidas.</li>
              </ul>
            )}

            {!e.contabilizacion_automatica && (faltantes.length > 0 || bancosSinCuenta.length > 0 || e.nit === 'CF') && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Antes de activar:{' '}
                  {[
                    e.nit === 'CF' || e.razon_social === 'Por definir' ? 'completa razón social y NIT (pestaña Empresa)' : null,
                    faltantes.length > 0 ? `asigna ${faltantes.length} cuenta(s) en el mapeo` : null,
                    bancosSinCuenta.length > 0 ? `asigna la cuenta contable de ${bancosSinCuenta.length} cuenta(s) bancaria(s)` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  .
                </span>
              </div>
            )}

            {puedeConfigurar && (
              <form action={cambiarAutomatica}>
                <input type="hidden" name="activar" value={e.contabilizacion_automatica ? '0' : '1'} />
                <BotonConfirmar
                  mensaje={
                    e.contabilizacion_automatica
                      ? '¿Apagar las partidas automáticas? Las operaciones que ocurran mientras estén apagadas no se contabilizarán.'
                      : '¿Activar las partidas automáticas? Desde ahora cada operación generará su partida y se creará la partida de apertura.'
                  }
                  className={cn(
                    'rounded-lg px-4 py-2 text-sm font-semibold',
                    e.contabilizacion_automatica
                      ? 'border border-destructive/50 text-destructive hover:bg-destructive/10'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90',
                  )}
                >
                  {e.contabilizacion_automatica ? 'Apagar partidas automáticas' : 'Activar partidas automáticas'}
                </BotonConfirmar>
              </form>
            )}
          </section>

          {e.fecha_inicio_contable && (
            <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-sm">
              <p className="font-semibold text-foreground">Partida de apertura</p>
              {apertura ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  {apertura.estado === 'borrador' ? 'En borrador, pendiente de revisión.' : 'Contabilizada.'}
                  <Link href={`/contabilidad/partidas/${apertura.id}`} className="font-semibold text-primary hover:underline">
                    Ver partida
                  </Link>
                </p>
              ) : (
                <>
                  <p className="text-muted-foreground">No hay partida de apertura generada (o se descartó).</p>
                  {puedeConfigurar && (
                    <form action={generarApertura}>
                      <button type="submit" className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted">
                        Generar partida de apertura con los saldos de hoy
                      </button>
                    </form>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      )}
    </main>
  )
}
