import { redirect } from 'next/navigation'
import { Settings2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { clasesCampo } from '@/lib/contabilidad-general'
import { type TipoActivo } from '@/lib/activos'
import { Encabezado, EnlaceVolver, Mensajes } from '@/components/contabilidad/comunes'
import { guardarTipoActivo } from '../acciones'

export const metadata = { title: 'Tipos de activo — ASTRO' }

export default async function TiposActivoPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const [puede, { data }, { data: cuentas }, { data: centros }] = await Promise.all([
    tienePermiso('contabilidad', 'configurar'),
    supabase.from('tipos_activo').select('*').order('nombre'),
    supabase.from('cuentas_contables').select('id, codigo, nombre').eq('es_detalle', true).eq('activo', true).order('codigo'),
    supabase.from('centros_costo').select('id, codigo, nombre').eq('activo', true).order('codigo'),
  ])
  if (!puede) redirect('/contabilidad/activos')
  const tipos = (data ?? []) as TipoActivo[]
  const lista = (cuentas ?? []) as { id: number; codigo: string; nombre: string }[]
  const listaCc = (centros ?? []) as { id: number; codigo: string; nombre: string }[]
  const selector = (name: string, valor: number | null, prefijo: string) => (
    <select name={name} required defaultValue={valor ?? ''} className={cn(clasesCampo, 'py-1.5 text-xs')}>
      <option value="" disabled>
        Cuenta…
      </option>
      {lista
        .filter((c) => c.codigo.startsWith(prefijo))
        .map((c) => (
          <option key={c.id} value={c.id}>
            {c.codigo} {c.nombre}
          </option>
        ))}
    </select>
  )
  const formulario = (t?: TipoActivo) => (
    <form key={t?.id ?? 'nuevo'} action={guardarTipoActivo} className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-4 md:grid-cols-6">
      {t && <input type="hidden" name="id" value={t.id} />}
      <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
        Prefijo
        <input name="prefijo" required defaultValue={t?.prefijo ?? ''} disabled={Boolean(t)} className={cn(clasesCampo, 'py-1.5 font-mono text-xs uppercase')} />
        {t && <input type="hidden" name="prefijo" value={t.prefijo} />}
      </label>
      <label className="col-span-2 flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
        Nombre
        <input name="nombre" required defaultValue={t?.nombre ?? ''} className={cn(clasesCampo, 'py-1.5 text-xs')} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
        Vida útil (meses)
        <input name="vida_util_meses" type="number" min="1" required defaultValue={t?.vida_util_meses ?? 60} className={cn(clasesCampo, 'py-1.5 text-xs')} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
        % anual
        <input name="porcentaje_anual" type="number" step="0.01" min="0.01" max="100" required defaultValue={t?.porcentaje_anual ?? 20} className={cn(clasesCampo, 'py-1.5 text-xs')} />
      </label>
      <label className="flex items-center gap-2 self-end pb-2 text-xs">
        <input type="checkbox" name="activo" defaultChecked={t?.activo ?? true} /> Activo
      </label>
      <label className="col-span-2 flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
        Cuenta del activo
        {selector('cuenta_activo_id', t?.cuenta_activo_id ?? null, '1.02.')}
      </label>
      <label className="col-span-2 flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
        Depreciación acumulada
        {selector('cuenta_depreciacion_id', t?.cuenta_depreciacion_id ?? null, '1.02.02')}
      </label>
      <label className="col-span-2 flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
        Gasto de depreciación
        {selector('cuenta_gasto_id', t?.cuenta_gasto_id ?? null, '6.')}
      </label>
      <label className="col-span-2 flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
        Centro de costo por defecto
        <select name="centro_costo_id" defaultValue={t?.centro_costo_id ?? ''} className={cn(clasesCampo, 'py-1.5 text-xs')}>
          <option value="">—</option>
          {listaCc.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} · {c.nombre}
            </option>
          ))}
        </select>
      </label>
      <div className="col-span-2 flex items-end md:col-span-4">
        <button type="submit" className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground">
          {t ? 'Guardar' : 'Crear tipo'}
        </button>
      </div>
    </form>
  )

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={Settings2}
        titulo="Tipos de activo"
        descripcion="Cada tipo define el prefijo del número de activo, la vida útil y las cuentas que usa. Los porcentajes precargados son los máximos anuales del ISR (Decreto 10-2012, art. 28); ajústalos con tu contador."
      >
        <EnlaceVolver href="/contabilidad/activos">← Activos fijos</EnlaceVolver>
      </Encabezado>
      <Mensajes ok={sp.ok} error={sp.error} />
      {tipos.map((t) => formulario(t))}
      <details className="rounded-xl border border-dashed border-primary/40 bg-card p-2">
        <summary className="cursor-pointer px-2 py-1 text-sm font-semibold text-primary">Nuevo tipo de activo</summary>
        <div className="mt-2">{formulario()}</div>
      </details>
    </main>
  )
}
