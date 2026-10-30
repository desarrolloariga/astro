'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const txt = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

function volver(clave: 'ok' | 'error', mensaje: string): never {
  redirect(`/contabilidad/centros-costo?${clave}=${encodeURIComponent(mensaje)}`)
}

export async function guardarCentroCosto(formData: FormData) {
  const id = Number(txt(formData, 'id')) || null
  const codigo = txt(formData, 'codigo').toUpperCase()
  if (!/^CC-[A-Z0-9-]+$/.test(codigo)) volver('error', 'El código debe empezar con CC- (ej. CC-LOG)')
  if (!txt(formData, 'nombre')) volver('error', 'Escribe el nombre del centro de costo')
  const tienda = Number(txt(formData, 'tienda_id'))

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_guardar_centro_costo', {
    p_id: id,
    p_codigo: codigo,
    p_nombre: txt(formData, 'nombre'),
    p_tienda_id: tienda > 0 ? tienda : null,
    p_activo: id ? formData.get('activo') === 'on' : true,
    p_descripcion: txt(formData, 'descripcion') || null,
  })
  if (error) volver('error', error.message.includes('duplicate') ? 'Ya existe un centro de costo con ese código o esa tienda' : error.message)
  revalidatePath('/contabilidad/centros-costo')
  volver('ok', id ? `${codigo} actualizado` : `${codigo} creado`)
}
