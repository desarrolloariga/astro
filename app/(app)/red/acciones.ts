'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { tienePermiso } from '@/lib/permisos'

const TIPOS_EMBAJADOR = ['A1', 'B2', 'C3', 'D4']

function aNumero(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export async function crearEmbajador(formData: FormData) {
  if (!(await tienePermiso('usuarios', 'crear_embajador'))) redirect('/inicio')

  const creador = await obtenerUsuarioActual()
  const nombre = String(formData.get('nombre') ?? '').trim()
  const correo = String(formData.get('correo') ?? '').trim().toLowerCase()
  const telefono = String(formData.get('telefono') ?? '').trim()
  const tipoEmbajador = String(formData.get('tipo_embajador') ?? '').trim()

  if (!nombre || !correo) {
    redirect(`/red?error=${encodeURIComponent('Nombre y correo son obligatorios')}`)
  }
  if (!TIPOS_EMBAJADOR.includes(tipoEmbajador)) {
    redirect(`/red?error=${encodeURIComponent('Elige el tipo de embajador')}`)
  }

  const admin = createAdminClient()

  const { data: rol } = await admin.from('roles').select('id').eq('nombre', 'embajador').maybeSingle()
  if (!rol) {
    redirect(`/red?error=${encodeURIComponent('Rol "embajador" no existe')}`)
  }

  // Contraseña aleatoria que nadie necesita conocer: el embajador
  // activa su cuenta con "Olvidé mi contraseña" en el login.
  const { data: nuevoUsuario, error: errorAuth } = await admin.auth.admin.createUser({
    email: correo,
    password: randomUUID(),
    email_confirm: true,
    app_metadata: { app: 'ariga', rol: 'embajador' },
    user_metadata: { nombre },
  })

  if (errorAuth || !nuevoUsuario.user) {
    redirect(`/red?error=${encodeURIComponent(errorAuth?.message ?? 'No se pudo crear el embajador')}`)
  }

  // El trigger trg_auth_alta_usuario debería insertar la fila en public.usuarios
  // al detectar app_metadata.app = 'ariga', pero se confirmó (2026-08-25) que no
  // es confiable en este flujo — se asegura aquí explícitamente con upsert
  // idempotente por correo, con el cliente admin (saltando RLS, ya que un
  // asesor no tiene permiso de escritura directa sobre usuarios).
  const { error: errorUsuario } = await admin.from('usuarios').upsert(
    {
      auth_uid: nuevoUsuario.user.id,
      nombre,
      correo,
      rol_id: rol.id,
      telefono: telefono || null,
      superior_id: creador.id,
      asesor_contacto_id: creador.id,
      tipo_embajador: tipoEmbajador,
    },
    { onConflict: 'correo' },
  )

  if (errorUsuario) {
    redirect(`/red?error=${encodeURIComponent(errorUsuario.message)}`)
  }

  revalidatePath('/red')
  redirect(
    `/red?ok=${encodeURIComponent(`Embajador ${nombre} creado. Pídele que use "Olvidé mi contraseña" en el login con su correo (${correo}) para activar su cuenta.`)}`,
  )
}

export async function anularVenta(formData: FormData) {
  if (!(await tienePermiso('ventas', 'anular'))) redirect('/inicio')

  const ventaId = aNumero(formData.get('venta_id'))
  const motivo = String(formData.get('motivo') ?? '').trim()
  const redireccion = String(formData.get('redireccion') ?? '/ventas')

  if (!ventaId || !motivo) {
    redirect(`${redireccion}?error=${encodeURIComponent('Indica el motivo de la anulación')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_anular_venta', {
    p_venta_id: ventaId,
    p_motivo: motivo,
  })

  revalidatePath('/ventas')
  revalidatePath('/red/equipo')
  if (error) {
    redirect(`${redireccion}?error=${encodeURIComponent(error.message)}`)
  }
  redirect(`${redireccion}?ok=${encodeURIComponent('Venta anulada')}`)
}
