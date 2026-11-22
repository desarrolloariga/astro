import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import type { CatalogosRrhh } from '@/components/rrhh/formulario-colaborador'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

/** Catálogos para el formulario del expediente (una sola ola de consultas). */
export async function cargarCatalogosRrhh(supabase: SupabaseClient): Promise<CatalogosRrhh> {
  const [deps, areas, puestos, tiendas, jefes, centros, usuarios] = await Promise.all([
    supabase.from('rrhh_departamentos').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('rrhh_areas').select('id, nombre, departamento_id').eq('activo', true).order('nombre'),
    supabase.from('rrhh_puestos').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('tiendas').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('colaboradores').select('id, nombres, apellidos').neq('estado', 'baja').order('apellidos'),
    supabase.from('centros_costo').select('id, codigo, nombre').eq('activo', true).order('codigo'),
    supabase.from('usuarios').select('id, nombre, rol:rol_id ( nombre )').eq('activo', true).order('nombre'),
  ])
  return {
    departamentos: (deps.data ?? []) as CatalogosRrhh['departamentos'],
    areas: (areas.data ?? []) as CatalogosRrhh['areas'],
    puestos: (puestos.data ?? []) as CatalogosRrhh['puestos'],
    tiendas: (tiendas.data ?? []) as CatalogosRrhh['tiendas'],
    jefes: ((jefes.data ?? []) as { id: number; nombres: string; apellidos: string }[]).map((j) => ({ id: j.id, nombre: `${j.nombres} ${j.apellidos}` })),
    centros: (centros.data ?? []) as CatalogosRrhh['centros'],
    // Embajadores y mayoristas no son colaboradores de la empresa.
    usuarios: ((usuarios.data ?? []) as unknown as { id: number; nombre: string; rol: { nombre: string } | null }[])
      .filter((u) => !['embajador', 'mayorista'].includes(u.rol?.nombre ?? ''))
      .map((u) => ({ id: u.id, nombre: u.nombre })),
  }
}

/** URLs firmadas (1 h) de archivos del bucket privado de RRHH. */
export async function urlsFirmadas(rutas: (string | null | undefined)[]): Promise<Map<string, string>> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const lista = [...new Set(rutas.filter((r): r is string => Boolean(r)))]
  const mapa = new Map<string, string>()
  if (!lista.length) return mapa
  const { data } = await createAdminClient().storage.from('astro-rrhh').createSignedUrls(lista, 3600)
  data?.forEach((u) => u.signedUrl && u.path && mapa.set(u.path, u.signedUrl))
  return mapa
}
