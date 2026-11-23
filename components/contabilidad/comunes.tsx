import Link from 'next/link'
import { AlertCircle, CheckCircle2, Lock, type LucideIcon } from 'lucide-react'
import { clasesCampo } from '@/lib/contabilidad-general'
import { autorizarMesCerrado } from '@/app/(app)/contabilidad/autorizacion-acciones'

const MES_CERRADO = /El mes de (\d{2}\/\d{4}) está cerrado en contabilidad/

/** sinAutorizacion: el llamador ya pide el PIN en su propio formulario (evita un formulario anidado). */
export function Mensajes({ ok, error, sinAutorizacion }: { ok?: string; error?: string; sinAutorizacion?: boolean }) {
  const mesCerrado = sinAutorizacion ? undefined : error?.match(MES_CERRADO)?.[1]
  return (
    <>
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
      {mesCerrado && (
        // Autorización en el mismo lugar del error: luego se repite la operación (un uso, 10 minutos).
        <form action={autorizarMesCerrado} className="flex flex-col gap-3">
          <input type="hidden" name="mes" value={mesCerrado} />
          <CamposAutorizacion mensaje={`${mesCerrado} está cerrado. Autoriza una operación en ese mes con tu PIN contable y el motivo; después repite la operación.`} />
          <button type="submit" className="self-start rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Autorizar
          </button>
        </form>
      )}
    </>
  )
}

/** Aviso cuando la contabilización automática está apagada: los módulos no generan partidas. */
export function AvisoContabilizacion({ activa }: { activa: boolean }) {
  if (activa) return null
  return (
    <div className="flex flex-wrap items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">
        La contabilización automática está apagada: facturas, pagos, bancos, ventas e inventario se registran en su módulo pero <b>no generan partidas</b> ni
        afectan las cuentas.{' '}
        <Link href="/contabilidad/configuracion" className="font-semibold underline">
          Actívala en Configuración contable
        </Link>{' '}
        con la fecha de inicio de la contabilidad.
      </span>
    </div>
  )
}

export function Encabezado({
  icono: Icono,
  titulo,
  descripcion,
  children,
}: {
  icono: LucideIcon
  titulo: string
  descripcion: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <Icono className="h-5 w-5 text-primary" />
          {titulo}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{descripcion}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </div>
  )
}

/** Campos de PIN contable + motivo para operar en un mes cerrado. */
export function CamposAutorizacion({ mensaje }: { mensaje: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
      <p className="flex items-start gap-2 text-xs font-medium text-amber-800 dark:text-amber-300">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {mensaje}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          PIN contable
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]{6,8}"
            required
            className={clasesCampo}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Motivo (queda registrado)
          <input name="motivo_cierre" required maxLength={300} className={clasesCampo} />
        </label>
      </div>
    </div>
  )
}

export function EnlaceVolver({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-sm font-semibold text-primary hover:underline">
      {children}
    </Link>
  )
}
