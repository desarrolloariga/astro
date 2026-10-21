import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { GeneradorLink, type PiezaGenerador } from '@/components/catalogo/generador-link'
import { crearLinkPersonalizado } from '@/app/(app)/links/acciones'

export const metadata = { title: 'Generar link — ASTRO' }

const ROLES_LINK = ['tienda', 'asesor', 'embajador', 'admin']
const LOTE = 1000

export default async function GenerarLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (!ROLES_LINK.includes(usuario.rol)) redirect('/catalogo')
  const { error } = await searchParams
  const supabase = await createClient()

  // Solo lo que hoy se ve en un enlace (disponible; sin "en tránsito").
  const piezas: PiezaGenerador[] = []
  for (let desde = 0; ; desde += LOTE) {
    const { data } = await supabase
      .from('vw_catalogo')
      .select('id, codigo, nombre, categoria_id, categoria, material_id, material, kilataje, precio_venta, imagen_principal')
      .in('estado', ['disponible_cedi', 'disponible_tienda'])
      .order('id', { ascending: false })
      .range(desde, desde + LOTE - 1)
    const lote = (data ?? []) as PiezaGenerador[]
    piezas.push(...lote)
    if (lote.length < LOTE || desde >= 20 * LOTE) break
  }

  const { data: parametro } = await supabase.from('parametros').select('valor').eq('clave', 'dias_vigencia_link').maybeSingle()
  const diasPorDefecto = Number(parametro?.valor ?? 7) || 7

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <Link
        href="/catalogo"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Catálogo
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Generar link de catálogo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Arma un catálogo para compartir. Queda amarrado a tu usuario: toda venta que entre por él se registra a tu nombre y
          la ves en Enlaces con su monto y comisión.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <GeneradorLink piezas={piezas} diasPorDefecto={diasPorDefecto} accion={crearLinkPersonalizado} />
    </main>
  )
}
