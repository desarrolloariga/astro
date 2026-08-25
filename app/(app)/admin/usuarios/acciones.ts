'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tienePermiso } from '@/lib/permisos'

function aNumero(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function aTexto(formData: FormData, nombre: string): string | null {
  const texto = String(formData.get(nombre) ?? '').trim()
  return texto || null
}

async function exigirPermiso(modulo: string, accion: string) {
  if (!(await tienePermiso(modulo, accion))) redirect('/inicio')
}

export async function crearUsuario(formData: FormData) {
  await exigirPermiso('usuarios', 'crear')

  const nombre = String(formData.get('nombre') ?? '').trim()
  const correo = String(formData.get('correo') ?? '').trim().toLowerCase()
  const telefono = aTexto(formData, 'telefono')
  const contrasena = String(formData.get('contrasena') ?? '')
  const rolNombre = String(formData.get('rol_nombre') ?? '').trim()
  const tiendaId = aNumero(formData.get('tienda_id'))
  const superiorId = aNumero(formData.get('superior_id'))

  if (!nombre || !correo || !rolNombre) {
    redirect(`/admin/usuarios?error=${encodeURIComponent('Nombre, correo y rol son obligatorios')}`)
  }
  if (contrasena.length < 8) {
    redirect(`/admin/usuarios?error=${encodeURIComponent('La contraseña temporal debe tener al menos 8 caracteres')}`)
  }

  const admin = createAdminClient()

  const { data: rol } = await admin.from('roles').select('id').eq('nombre', rolNombre).maybeSingle()
  if (!rol) {
    redirect(`/admin/usuarios?error=${encodeURIComponent(`Rol "${rolNombre}" no existe`)}`)
  }

  const { data: nuevoUsuario, error: errorAuth } = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    app_metadata: { app: 'ariga', rol: rolNombre },
    user_metadata: { nombre },
  })

  if (errorAuth || !nuevoUsuario.user) {
    redirect(`/admin/usuarios?error=${encodeURIComponent(errorAuth?.message ?? 'No se pudo crear el usuario')}`)
  }

  // El trigger trg_auth_alta_usuario debería insertar la fila en public.usuarios
  // al detectar app_metadata.app = 'ariga', pero se confirmó (2026-08-25) que no
  // es confiable en este flujo — se asegura aquí explícitamente con upsert
  // idempotente por correo, usando el cliente admin para saltar RLS igual que
  // el trigger.
  const { data: filaUsuario, error: errorUsuario } = await admin
    .from('usuarios')
    .upsert(
      {
        auth_uid: nuevoUsuario.user.id,
        nombre,
        correo,
        telefono,
        rol_id: rol.id,
        tienda_id: tiendaId,
        superior_id: superiorId,
      },
      { onConflict: 'correo' },
    )
    .select('id')
    .single()

  if (errorUsuario) {
    redirect(`/admin/usuarios?error=${encodeURIComponent(errorUsuario.message)}`)
  }

  // Datos laborales son opcionales y solo tienen sentido si quien crea
  // la cuenta puede verlos/editarlos después — si no, se omiten en vez
  // de escribir datos sensibles que su propio rol no podría gestionar.
  if (await tienePermiso('usuarios', 'editar_laboral')) {
    const dpi = aTexto(formData, 'dpi')
    const nitLaboral = aTexto(formData, 'nit_laboral')
    const fechaNacimiento = aTexto(formData, 'fecha_nacimiento')
    const direccionLaboral = aTexto(formData, 'direccion_laboral')
    const contactoEmergenciaNombre = aTexto(formData, 'contacto_emergencia_nombre')
    const contactoEmergenciaTelefono = aTexto(formData, 'contacto_emergencia_telefono')
    const fechaIngreso = aTexto(formData, 'fecha_ingreso')
    const tipoContrato = aTexto(formData, 'tipo_contrato')
    const salarioBase = aNumero(formData.get('salario_base'))
    const bancoLaboral = aTexto(formData, 'banco_laboral')
    const cuentaBancariaLaboral = aTexto(formData, 'cuenta_bancaria_laboral')

    const hayDatosLaborales =
      dpi || nitLaboral || fechaNacimiento || direccionLaboral || contactoEmergenciaNombre ||
      contactoEmergenciaTelefono || fechaIngreso || tipoContrato || salarioBase != null ||
      bancoLaboral || cuentaBancariaLaboral

    if (hayDatosLaborales && filaUsuario) {
      await admin.from('usuarios_datos_laborales').upsert(
        {
          usuario_id: filaUsuario.id,
          dpi,
          nit: nitLaboral,
          fecha_nacimiento: fechaNacimiento,
          direccion: direccionLaboral,
          contacto_emergencia_nombre: contactoEmergenciaNombre,
          contacto_emergencia_telefono: contactoEmergenciaTelefono,
          fecha_ingreso: fechaIngreso,
          tipo_contrato: tipoContrato,
          salario_base: salarioBase,
          banco: bancoLaboral,
          cuenta_bancaria: cuentaBancariaLaboral,
        },
        { onConflict: 'usuario_id' },
      )
    }
  }

  revalidatePath('/admin/usuarios')
  redirect(`/admin/usuarios?ok=${encodeURIComponent(`Usuario ${nombre} creado`)}`)
}

export async function actualizarUsuario(formData: FormData) {
  await exigirPermiso('usuarios', 'editar')

  const id = aNumero(formData.get('id'))
  if (!id) redirect('/admin/usuarios')

  const supabase = await createClient()
  const { error } = await supabase
    .from('usuarios')
    .update({
      rol_id: aNumero(formData.get('rol_id')),
      tienda_id: aNumero(formData.get('tienda_id')),
      superior_id: aNumero(formData.get('superior_id')),
    })
    .eq('id', id)

  revalidatePath('/admin/usuarios')
  if (error) redirect(`/admin/usuarios?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/usuarios?ok=${encodeURIComponent('Usuario actualizado')}`)
}

export async function asignarSuperior(formData: FormData) {
  await exigirPermiso('usuarios', 'editar')

  const id = aNumero(formData.get('id'))
  const superiorId = aNumero(formData.get('superior_id'))
  if (!id) redirect('/admin/usuarios/jerarquia')

  const supabase = await createClient()

  if (superiorId != null) {
    if (superiorId === id) {
      redirect(
        `/admin/usuarios/jerarquia?error=${encodeURIComponent('Un usuario no puede ser su propio superior')}`,
      )
    }
    const { data: todos } = await supabase.from('usuarios').select('id, superior_id')
    const superiorDe = new Map((todos ?? []).map((u) => [u.id, u.superior_id as number | null]))
    let cursor: number | null = superiorId
    while (cursor != null) {
      if (cursor === id) {
        redirect(
          `/admin/usuarios/jerarquia?error=${encodeURIComponent('Ese cambio crearía un ciclo en la jerarquía')}`,
        )
      }
      cursor = superiorDe.get(cursor) ?? null
    }
  }

  const { error } = await supabase.from('usuarios').update({ superior_id: superiorId }).eq('id', id)

  revalidatePath('/admin/usuarios/jerarquia')
  revalidatePath('/admin/usuarios')
  if (error) redirect(`/admin/usuarios/jerarquia?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/usuarios/jerarquia?ok=${encodeURIComponent('Jerarquía actualizada')}`)
}

export async function alternarActivoUsuario(formData: FormData) {
  await exigirPermiso('usuarios', 'editar')

  const id = aNumero(formData.get('id'))
  const activo = formData.get('activo') === '1'
  if (!id) redirect('/admin/usuarios')

  const supabase = await createClient()
  const { error } = await supabase.from('usuarios').update({ activo: !activo }).eq('id', id)

  revalidatePath('/admin/usuarios')
  if (error) redirect(`/admin/usuarios?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/usuarios?ok=${encodeURIComponent(activo ? 'Usuario desactivado' : 'Usuario reactivado')}`)
}

export async function actualizarDatosLaborales(formData: FormData) {
  await exigirPermiso('usuarios', 'editar_laboral')

  const usuarioId = aNumero(formData.get('usuario_id'))
  if (!usuarioId) redirect('/admin/usuarios')

  const supabase = await createClient()
  const { error } = await supabase.from('usuarios_datos_laborales').upsert(
    {
      usuario_id: usuarioId,
      dpi: aTexto(formData, 'dpi'),
      nit: aTexto(formData, 'nit_laboral'),
      fecha_nacimiento: aTexto(formData, 'fecha_nacimiento'),
      direccion: aTexto(formData, 'direccion_laboral'),
      contacto_emergencia_nombre: aTexto(formData, 'contacto_emergencia_nombre'),
      contacto_emergencia_telefono: aTexto(formData, 'contacto_emergencia_telefono'),
      fecha_ingreso: aTexto(formData, 'fecha_ingreso'),
      tipo_contrato: aTexto(formData, 'tipo_contrato'),
      salario_base: aNumero(formData.get('salario_base')),
      banco: aTexto(formData, 'banco_laboral'),
      cuenta_bancaria: aTexto(formData, 'cuenta_bancaria_laboral'),
    },
    { onConflict: 'usuario_id' },
  )

  revalidatePath(`/admin/usuarios/${usuarioId}`)
  if (error) redirect(`/admin/usuarios/${usuarioId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/usuarios/${usuarioId}?ok=${encodeURIComponent('Datos laborales actualizados')}`)
}
