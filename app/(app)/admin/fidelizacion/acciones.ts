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
