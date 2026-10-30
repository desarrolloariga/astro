import { clasesCampo } from '@/lib/contabilidad-general'

/** Filtro GET de rango de fechas con campos extra (nivel, centro de costo, cuenta…). */
export function FiltroRango({
  desde,
  hasta,
  children,
}: {
  desde: string
  hasta: string
  children?: React.ReactNode
}) {
  return (
    <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3 print:hidden">
      <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
        Del
        <input name="desde" type="date" required defaultValue={desde} className={clasesCampo} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
        Al
        <input name="hasta" type="date" required defaultValue={hasta} className={clasesCampo} />
      </label>
      {children}
      <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
        Consultar
      </button>
    </form>
  )
}

/** Encabezado del reporte (vista previa; el formato SAT completo llega con los libros oficiales). */
export function EncabezadoReporte({
  razonSocial,
  nit,
  titulo,
  periodo,
}: {
  razonSocial: string
  nit: string
  titulo: string
  periodo: string
}) {
  return (
    <div className="text-center">
      <p className="text-sm font-bold uppercase text-foreground">{razonSocial}</p>
      <p className="text-xs text-muted-foreground">NIT {nit}</p>
      <p className="text-sm font-semibold text-foreground">{titulo}</p>
      <p className="text-xs text-foreground">{periodo}</p>
      <p className="text-xs italic text-muted-foreground">Cifras expresadas en Quetzales</p>
    </div>
  )
}
