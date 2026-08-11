'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function iniciarSesion(formData: FormData) {
  const correo = String(formData.get('correo') ?? '').trim()
  const contrasena = String(formData.get('contrasena') ?? '')
  const destino = String(formData.get('destino') ?? '') || '/inicio'

  if (!correo || !contrasena) {
    redirect('/login?error=Ingresa%20tu%20correo%20y%20contrase%C3%B1a')
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: correo,
    password: contrasena,
  })

  if (error) {
    redirect('/login?error=Credenciales%20incorrectas.%20Verifica%20tu%20correo%20y%20contrase%C3%B1a.')
  }

  redirect(destino)
}

export async function cerrarSesion() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function enviarRecuperacion(formData: FormData) {
  const correo = String(formData.get('correo') ?? '').trim()

  if (!correo) {
    redirect('/recuperar?error=Ingresa%20tu%20correo')
  }

  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(correo, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/restablecer`,
  })

  // Siempre se confirma el envío (no se revela si el correo existe o no)
  redirect('/recuperar?enviado=1')
}
