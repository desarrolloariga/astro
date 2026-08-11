'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'

function aNumero(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

async function exigirAdminOCoordinador() {
  const usuario = await obtenerUsuarioActual()
  if (!['admin', 'coordinador'].includes(usuario.rol)) redirect('/inicio')
  return usuario
}

export async function crearNivel(formData: FormData) {
  const usuario = await exigirAdminOCoordinador()
  if (usuario.rol !== 'admin') redirect('/inicio')

  const supabase = await createClient()
  const { error } = await supabase.from('niveles').insert({
    nombre: String(formData.get('nombre') ?? '').trim(),
    umbral_puntos: aNumero(formData.get('umbral_puntos')) ?? 0,
    orden: aNumero(formData.get('orden')) ?? 0,
  })

  revalidatePath('/admin/fidelizacion')
  if (error) redirect(`/admin/fidelizacion?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/fidelizacion?ok=${encodeURIComponent('Nivel creado')}`)
}

export async function crearInsignia(formData: FormData) {
  const usuario = await exigirAdminOCoordinador()
  if (usuario.rol !== 'admin') redirect('/inicio')

  const tipo = String(formData.get('criterio_tipo') ?? '').trim()
  const umbral = aNumero(formData.get('criterio_umbral'))
  const criterio = tipo === 'ventas_mes' ? { tipo, umbral: umbral ?? 10 } : { tipo }

  const supabase = await createClient()
  const { error } = await supabase.from('insignias').insert({
    nombre: String(formData.get('nombre') ?? '').trim(),
    descripcion: String(formData.get('descripcion') ?? '').trim() || null,
    criterio,
  })

  revalidatePath('/admin/fidelizacion')
  if (error) redirect(`/admin/fidelizacion?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/fidelizacion?ok=${encodeURIComponent('Insignia creada')}`)
}

export async function crearPremio(formData: FormData) {
  const usuario = await exigirAdminOCoordinador()
  if (usuario.rol !== 'admin') redirect('/inicio')

  const supabase = await createClient()
  const { error } = await supabase.from('premios').insert({
    periodo_id: aNumero(formData.get('periodo_id')),
    posicion_desde: aNumero(formData.get('posicion_desde')) ?? 1,
    posicion_hasta: aNumero(formData.get('posicion_hasta')) ?? 1,
    descripcion: String(formData.get('descripcion') ?? '').trim(),
  })

  revalidatePath('/admin/fidelizacion')
  if (error) redirect(`/admin/fidelizacion?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/fidelizacion?ok=${encodeURIComponent('Premio creado')}`)
}

export async function crearReconocimiento(formData: FormData) {
  await exigirAdminOCoordinador()

  const supabase = await createClient()
  const { error } = await supabase.from('reconocimientos').insert({
    periodo_id: aNumero(formData.get('periodo_id')),
    usuario_id: aNumero(formData.get('usuario_id')),
    titulo: String(formData.get('titulo') ?? '').trim(),
    descripcion: String(formData.get('descripcion') ?? '').trim() || null,
    publicado: true,
  })

  revalidatePath('/admin/fidelizacion')
  if (error) redirect(`/admin/fidelizacion?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/fidelizacion?ok=${encodeURIComponent('Reconocimiento publicado')}`)
}
