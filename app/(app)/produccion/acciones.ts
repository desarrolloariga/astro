'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { obtenerUsuarioActual } from '@/lib/usuario'

const BUCKET = 'ariga-productos'

function aNumero(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function campoOpcional(formData: FormData, nombre: string): string | undefined {
  const texto = String(formData.get(nombre) ?? '').trim()
  return texto || undefined
}

/** Prefijo de código: primeras 3 letras del nombre de la categoría (sin acentos/espacios). */
function prefijoDesdeCategoria(nombreCategoria: string | null | undefined): string {
  if (!nombreCategoria) return 'ART'
  const limpio = nombreCategoria
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  return limpio.slice(0, 3) || 'ART'
}

export async function crearPieza(formData: FormData) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'produccion' && usuario.rol !== 'admin') {
    redirect('/inicio')
  }

  const nombre = String(formData.get('nombre') ?? '').trim()
  const publicar = formData.get('accion') === 'publicar'
  const modoInventario = formData.get('modo_inventario') === 'por_cantidad' ? 'por_cantidad' : 'pieza_unica'
  const cantidadInicial = modoInventario === 'por_cantidad' ? aNumero(formData.get('cantidad_inicial')) : null
  const categoriaId = aNumero(formData.get('categoria_id'))

  if (!nombre) {
    redirect('/produccion/nueva?error=El%20nombre%20es%20obligatorio')
  }
  if (modoInventario === 'por_cantidad' && (cantidadInicial == null || cantidadInicial <= 0)) {
    redirect('/produccion/nueva?error=Indica%20la%20cantidad%20inicial')
  }

  const atributos: Record<string, string> = {}
  const volumenMl = campoOpcional(formData, 'volumen_ml')
  if (volumenMl) atributos.volumen_ml = volumenMl
  const fragancia = campoOpcional(formData, 'fragancia')
  if (fragancia) atributos.fragancia = fragancia
  const talla = campoOpcional(formData, 'talla')
  if (talla) atributos.talla = talla
  const color = campoOpcional(formData, 'color')
  if (color) atributos.color = color
  const tela = campoOpcional(formData, 'tela')
  if (tela) atributos.tela = tela

  const supabase = await createClient()

  // GTQ por defecto (multi-moneda llegará con multi-país)
  const [{ data: moneda }, { data: categoria }] = await Promise.all([
    supabase.from('monedas').select('id').eq('codigo', 'GTQ').single(),
    categoriaId
      ? supabase.from('categorias').select('nombre').eq('id', categoriaId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const prefijo = prefijoDesdeCategoria(categoria?.nombre)
  const { count: existentes } = await supabase
    .from('productos')
    .select('id', { count: 'exact', head: true })
    .ilike('codigo', `${prefijo}-%`)

  let numero = (existentes ?? 0) + 1
  let codigo = `${prefijo}-${String(numero).padStart(4, '0')}`

  const datosBase = {
    nombre,
    descripcion: String(formData.get('descripcion') ?? '').trim() || null,
    categoria_id: categoriaId,
    material_id: aNumero(formData.get('material_id')),
    peso_gramos: aNumero(formData.get('peso_gramos')),
    kilataje: String(formData.get('kilataje') ?? '').trim() || null,
    piedras: String(formData.get('piedras') ?? '').trim() || null,
    costo_produccion: aNumero(formData.get('costo_produccion')),
    precio_venta: aNumero(formData.get('precio_venta')),
    origen: formData.get('origen') === 'importado' ? 'importado' : 'local',
    modo_inventario: modoInventario,
    cantidad_inicial: cantidadInicial,
    atributos,
    moneda_id: moneda?.id ?? null,
    creado_por: usuario.id,
  }

  let pieza: { id: number } | null = null
  let error: { code?: string; message: string } | null = null

  // Reintenta unas pocas veces solo si el código autogenerado choca
  // por una carrera de creación concurrente (muy poco probable).
  for (let intento = 0; intento < 5; intento++) {
    const resultado = await supabase
      .from('productos')
      .insert({ ...datosBase, codigo })
      .select('id')
      .single()

    if (!resultado.error) {
      pieza = resultado.data
      break
    }
    if (resultado.error.code === '23505') {
      numero++
      codigo = `${prefijo}-${String(numero).padStart(4, '0')}`
      continue
    }
    error = resultado.error
    break
  }

  if (!pieza) {
    redirect(`/produccion/nueva?error=${encodeURIComponent(error?.message ?? 'No se pudo crear el artículo')}`)
  }

  // Subida de fotos: el storage se escribe desde el servidor (service role)
  // tras haber validado el rol arriba; el bucket es de lectura pública.
  const fotos = formData
    .getAll('fotos')
    .filter((f): f is File => f instanceof File && f.size > 0)

  if (fotos.length > 0) {
    const admin = createAdminClient()
    let orden = 0
    for (const foto of fotos) {
      const extension = foto.name.split('.').pop()?.toLowerCase() || 'jpg'
      const ruta = `${pieza.id}/${orden}-${Date.now()}.${extension}`
      const { error: errorSubida } = await admin.storage
        .from(BUCKET)
        .upload(ruta, foto, { contentType: foto.type || 'image/jpeg' })

      if (!errorSubida) {
        const { data: publica } = admin.storage.from(BUCKET).getPublicUrl(ruta)
        await supabase.from('producto_imagenes').insert({
          producto_id: pieza.id,
          url: publica.publicUrl,
          orden,
          es_principal: orden === 0,
        })
        orden++
      }
    }
  }

  if (publicar) {
    const { error: errorPublicar } = await supabase.rpc('fn_publicar_producto', {
      p_producto_id: pieza.id,
      p_tienda_destino_id: aNumero(formData.get('tienda_destino_id')),
    })
    if (errorPublicar) {
      revalidatePath('/produccion')
      redirect(
        `/produccion?aviso=${encodeURIComponent(
          `Artículo ${codigo} guardado como borrador; no se publicó: ${errorPublicar.message}`,
        )}`,
      )
    }
  }

  revalidatePath('/produccion')
  redirect(
    `/produccion?ok=${encodeURIComponent(
      publicar ? `Artículo ${codigo} publicado al CEDI` : `Artículo ${codigo} guardado como borrador`,
    )}`,
  )
}

export async function publicarPieza(formData: FormData) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'produccion' && usuario.rol !== 'admin') {
    redirect('/inicio')
  }

  const productoId = aNumero(formData.get('producto_id'))
  if (!productoId) redirect('/produccion')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_publicar_producto', {
    p_producto_id: productoId,
  })

  revalidatePath('/produccion')
  if (error) {
    redirect(`/produccion?aviso=${encodeURIComponent(error.message)}`)
  }
  redirect(`/produccion?ok=${encodeURIComponent('Artículo publicado al CEDI')}`)
}

export async function agregarFotosPieza(formData: FormData) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'produccion' && usuario.rol !== 'admin') {
    redirect('/inicio')
  }

  const productoId = aNumero(formData.get('producto_id'))
  if (!productoId) redirect('/produccion')

  const fotos = formData
    .getAll('fotos')
    .filter((f): f is File => f instanceof File && f.size > 0)

  if (fotos.length === 0) {
    redirect(`/produccion/${productoId}/fotos?error=${encodeURIComponent('Selecciona al menos una foto')}`)
  }

  const supabase = await createClient()
  const { count } = await supabase
    .from('producto_imagenes')
    .select('id', { count: 'exact', head: true })
    .eq('producto_id', productoId)

  const admin = createAdminClient()
  let orden = count ?? 0
  for (const foto of fotos) {
    const extension = foto.name.split('.').pop()?.toLowerCase() || 'jpg'
    const ruta = `${productoId}/${orden}-${Date.now()}.${extension}`
    const { error: errorSubida } = await admin.storage
      .from(BUCKET)
      .upload(ruta, foto, { contentType: foto.type || 'image/jpeg' })

    if (!errorSubida) {
      const { data: publica } = admin.storage.from(BUCKET).getPublicUrl(ruta)
      await supabase.from('producto_imagenes').insert({
        producto_id: productoId,
        url: publica.publicUrl,
        orden,
        es_principal: orden === 0,
      })
      orden++
    }
  }

  revalidatePath(`/produccion/${productoId}/fotos`)
  revalidatePath('/produccion')
  redirect(`/produccion/${productoId}/fotos?ok=${encodeURIComponent('Fotos agregadas')}`)
}

export async function eliminarFotoPieza(formData: FormData) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'produccion' && usuario.rol !== 'admin') {
    redirect('/inicio')
  }

  const productoId = aNumero(formData.get('producto_id'))
  const imagenId = aNumero(formData.get('imagen_id'))
  if (!productoId || !imagenId) redirect('/produccion')

  const supabase = await createClient()
  const { error } = await supabase.from('producto_imagenes').delete().eq('id', imagenId)

  revalidatePath(`/produccion/${productoId}/fotos`)
  if (error) redirect(`/produccion/${productoId}/fotos?error=${encodeURIComponent(error.message)}`)
  redirect(`/produccion/${productoId}/fotos?ok=${encodeURIComponent('Foto eliminada')}`)
}
