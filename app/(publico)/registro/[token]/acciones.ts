'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

export type EstadoRegistro = { error?: string; valores?: { nombre: string; correo: string; telefono: string } }

const txt = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

/**
 * Registro público de un embajador con el enlace `token`. La cuenta se crea con la llave de
 * servicio (el visitante no tiene sesión); el enlace define su superior y su tipo de embajador.
 */
export async function registrarEmbajador(token: string, _previo: EstadoRegistro, formData: FormData): Promise<EstadoRegistro> {
  const nombre = txt(formData, 'nombre').replace(/\s+/g, ' ')
  const correo = txt(formData, 'correo').toLowerCase()
  const telefono = txt(formData, 'telefono').replace(/[^\d+]/g, '')
  const contrasena = String(formData.get('contrasena') ?? '')
  const valores = { nombre, correo, telefono: txt(formData, 'telefono') }
  const falla = (error: string): EstadoRegistro => ({ error, valores })

  // Campo trampa: los bots lo llenan, las personas no lo ven.
  if (txt(formData, 'empresa')) return falla('No se pudo completar el registro')
  if (!/^[a-f0-9]{32}$/.test(token)) return falla('Este enlace de registro no es válido')
  if (nombre.split(' ').length < 2 || nombre.length < 5) return falla('Escribe tu nombre y apellido')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) return falla('Revisa tu correo electrónico')
  if (telefono.replace(/^\+?502/, '').replace(/\D/g, '').length < 8) return falla('Escribe tu número de WhatsApp (8 dígitos)')
  if (contrasena.length < 8) return falla('La contraseña debe tener al menos 8 caracteres')
  if (contrasena !== String(formData.get('confirmar') ?? '')) return falla('Las contraseñas no coinciden')
  if (formData.get('acepto') !== 'on') return falla('Acepta los términos para continuar')

  const admin = createAdminClient()
  const [{ data: existe }, { data: rol }] = await Promise.all([
    admin.from('usuarios').select('id').eq('correo', correo).maybeSingle(),
    admin.from('roles').select('id').eq('nombre', 'embajador').maybeSingle(),
  ])
  if (existe) return falla('Ese correo ya tiene una cuenta ASTRO: entra con él o usa «Olvidé mi contraseña»')
  if (!rol) return falla('El registro no está disponible en este momento')

  // Reserva un lugar del enlace (respeta vigencia y cupo).
  const { data: enlace, error: errEnlace } = await admin.rpc('fn_enlace_registro_usar', { p_token: token })
  if (errEnlace || !enlace) return falla('Este enlace de registro ya no está disponible')
  const e = enlace as { id: number; superior_id: number; tipo_embajador: string }

  const { data: nuevo, error: errAuth } = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    app_metadata: { app: 'ariga', rol: 'embajador' },
    user_metadata: { nombre },
  })
  if (errAuth || !nuevo.user) {
    await admin.rpc('fn_enlace_registro_devolver', { p_id: e.id })
    return falla(
      /already|registered|exists/i.test(errAuth?.message ?? '')
        ? 'Ese correo ya tiene una cuenta ASTRO: entra con él o usa «Olvidé mi contraseña»'
        : 'No se pudo crear tu cuenta. Intenta de nuevo en un momento.',
    )
  }

  const { error: errUsuario } = await admin.from('usuarios').upsert(
    {
      auth_uid: nuevo.user.id,
      nombre,
      correo,
      telefono: telefono || null,
      rol_id: rol.id,
      superior_id: e.superior_id,
      asesor_contacto_id: e.superior_id,
      tipo_embajador: e.tipo_embajador,
      enlace_registro_id: e.id,
    },
    { onConflict: 'correo' },
  )
  if (errUsuario) {
    await admin.auth.admin.deleteUser(nuevo.user.id)
    await admin.rpc('fn_enlace_registro_devolver', { p_id: e.id })
    return falla('No se pudo crear tu cuenta. Intenta de nuevo en un momento.')
  }

  redirect(`/registro/${token}/bienvenida?n=${encodeURIComponent(nombre.split(' ')[0])}`)
}
