import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET_COMPROBANTES = 'ariga-comprobantes'
const TAMANO_MAXIMO = 10 * 1024 * 1024

function texto(formData: FormData, nombre: string): string | null {
  const v = String(formData.get(nombre) ?? '').trim()
  return v || null
}

/** Lee los campos de components/app/formulario-envio-pago.tsx en los 3 objetos que esperan las RPC de confirmación. */
export function extraerDatosCheckout(formData: FormData) {
  const archivo = formData.get('comprobante')
  return {
    paraCliente: formData.get('para_cliente') !== 'no',
    cliente: {
      nombre: texto(formData, 'cliente_nombre'),
      telefono: texto(formData, 'cliente_telefono'),
      correo: texto(formData, 'cliente_correo'),
    },
    envio: {
      nombre_destinatario: texto(formData, 'nombre_destinatario'),
      telefono_destinatario: texto(formData, 'telefono_destinatario'),
      departamento: texto(formData, 'departamento'),
      ciudad: texto(formData, 'ciudad'),
      direccion: texto(formData, 'direccion'),
      referencia: texto(formData, 'referencia_entrega'),
      latitud: texto(formData, 'latitud'),
      longitud: texto(formData, 'longitud'),
    },
    pago: {
      metodo: texto(formData, 'metodo_pago'),
      referencia: texto(formData, 'referencia_pago'),
      banco_origen: texto(formData, 'banco_origen'),
      fecha_pago: texto(formData, 'fecha_pago'),
      monto_declarado: texto(formData, 'monto_declarado'),
    },
    archivo: archivo instanceof File && archivo.size > 0 ? archivo : null,
  }
}

/** Valida y sube el comprobante (service role, mismo patrón que ventas/acciones.ts). Devuelve la ruta en el bucket. */
export async function subirComprobanteCheckout(archivo: File | null, carpeta: string): Promise<string> {
  if (!archivo) throw new Error('Adjunta el comprobante de pago')
  if (archivo.size > TAMANO_MAXIMO) throw new Error('El comprobante supera 10 MB')
  if (!archivo.type.startsWith('image/') && archivo.type !== 'application/pdf') {
    throw new Error('El comprobante debe ser una imagen o un PDF')
  }

  const extension = archivo.name.split('.').pop()?.toLowerCase() || (archivo.type === 'application/pdf' ? 'pdf' : 'jpg')
  const ruta = `checkout/${carpeta}/${Date.now()}.${extension}`
  const admin = createAdminClient()
  const { error } = await admin.storage
    .from(BUCKET_COMPROBANTES)
    .upload(ruta, archivo, { contentType: archivo.type || 'application/octet-stream' })
  if (error) throw new Error(`No se pudo subir el comprobante: ${error.message}`)
  return ruta
}

/** Si la confirmación falla después de subir el archivo, se borra para no dejar huérfanos. */
export async function eliminarComprobanteCheckout(ruta: string) {
  const admin = createAdminClient()
  await admin.storage.from(BUCKET_COMPROBANTES).remove([ruta])
}
