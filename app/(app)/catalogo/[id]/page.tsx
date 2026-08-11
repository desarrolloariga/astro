import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Gem, AlertCircle, BookmarkPlus, ShoppingBag, Share2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearPrecio } from '@/lib/formato'
import { EstadoPieza } from '@/components/app/estado-pieza'
import { CopyButton } from '@/components/app/copy-button'
import { CodigoQr } from '@/components/app/codigo-qr'
import { separarPieza, venderPieza, compartirPieza } from '../acciones'

export const metadata = { title: 'Pieza — ASTRO' }

type Imagen = { url: string; orden: number }

type PiezaCatalogo = {
  id: number
  codigo: string
  nombre: string
  descripcion: string | null
  categoria: string | null
  material: string | null
  peso_gramos: number | null
  kilataje: string | null
  piedras: string | null
  precio_venta: number | null
  estado: string
  tienda: string | null
  imagen_principal: string | null
  imagenes: Imagen[] | null
  modo_inventario: 'pieza_unica' | 'por_cantidad'
  stock_disponible: number | null
}

export default async function FichaPiezaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; link?: string }>
}) {
  if (!(await tienePermiso('catalogo', 'ver'))) redirect('/inicio')

  const { id } = await params
  const { error, link } = await searchParams
  const supabase = await createClient()

  const [{ data: pieza }, puedeSeparar, puedeVenderDirecto, puedeDescuentoEmbajador] = await Promise.all([
    supabase
      .from('vw_catalogo')
      .select(
        'id, codigo, nombre, descripcion, categoria, material, peso_gramos, kilataje, piedras, precio_venta, estado, tienda, imagen_principal, imagenes, modo_inventario, stock_disponible',
      )
      .eq('id', id)
      .maybeSingle<PiezaCatalogo>(),
    tienePermiso('separados', 'crear'),
    tienePermiso('ventas', 'crear'),
    tienePermiso('ventas', 'descuento_embajador'),
  ])

  const disponible = pieza?.estado && ['disponible_cedi', 'disponible_tienda'].includes(pieza.estado)
  const puedeVender = (puedeSeparar || puedeVenderDirecto) && disponible

  const imagenes = (pieza?.imagenes ?? []).sort((a, b) => a.orden - b.orden)

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <Link
        href="/catalogo"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al catálogo
      </Link>

      {!pieza ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <Gem className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Esta pieza ya no está disponible</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Puede haberse vendido, separado o estar en tránsito.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <div className="aspect-square overflow-hidden rounded-xl border border-border bg-secondary">
              {pieza.imagen_principal ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pieza.imagen_principal}
                  alt={pieza.nombre}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Gem className="h-14 w-14" strokeWidth={1.2} />
                </div>
              )}
            </div>
            {imagenes.length > 1 && (
              <div className="grid grid-cols-5 gap-2">
                {imagenes.map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={img.url}
                    src={img.url}
                    alt=""
                    className="aspect-square rounded-lg border border-border object-cover"
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <EstadoPieza estado={pieza.estado} />
                {pieza.tienda && (
                  <span className="text-xs font-medium text-muted-foreground">{pieza.tienda}</span>
                )}
              </div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">{pieza.nombre}</h1>
              <p className="text-xs text-muted-foreground">{pieza.codigo}</p>
            </div>

            <p className="text-2xl font-bold text-foreground">
              {pieza.precio_venta != null ? formatearPrecio(pieza.precio_venta) : '—'}
            </p>
            {pieza.modo_inventario === 'por_cantidad' && (
              <p className="text-sm text-muted-foreground">
                {pieza.stock_disponible ?? 0} unidades disponibles
              </p>
            )}

            {pieza.descripcion && (
              <p className="text-sm leading-relaxed text-muted-foreground">{pieza.descripcion}</p>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-4 text-sm">
              {pieza.categoria && (
                <>
                  <dt className="text-muted-foreground">Categoría</dt>
                  <dd className="text-right font-medium text-foreground">{pieza.categoria}</dd>
                </>
              )}
              {pieza.material && (
                <>
                  <dt className="text-muted-foreground">Material</dt>
                  <dd className="text-right font-medium text-foreground">{pieza.material}</dd>
                </>
              )}
              {pieza.kilataje && (
                <>
                  <dt className="text-muted-foreground">Kilataje</dt>
                  <dd className="text-right font-medium text-foreground">{pieza.kilataje}</dd>
                </>
              )}
              {pieza.piedras && (
                <>
                  <dt className="text-muted-foreground">Piedras</dt>
                  <dd className="text-right font-medium text-foreground">{pieza.piedras}</dd>
                </>
              )}
            </dl>

            <details className="rounded-xl border border-border bg-card">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">
                Código QR de la pieza
              </summary>
              <div className="flex flex-col items-center gap-2 px-4 pb-4">
                <CodigoQr
                  url={`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/catalogo/${pieza.id}`}
                  alt="Código QR de la pieza"
                />
                <p className="text-center text-xs text-muted-foreground">
                  Imprime y pega en la pieza física: al escanearlo se abre esta ficha.
                </p>
              </div>
            </details>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {link && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-xs text-primary">
                <span className="flex-1 truncate font-mono">{link}</span>
                <CopyButton texto={link} />
              </div>
            )}

            {puedeVender && (
              <form action={compartirPieza}>
                <input type="hidden" name="producto_id" value={pieza.id} />
                <button
                  type="submit"
                  className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Generar enlace para compartir esta pieza
                </button>
              </form>
            )}

            {puedeVender && (
              <div className="flex flex-col gap-4">
                {puedeSeparar && pieza.modo_inventario === 'pieza_unica' && (
                <details className="group rounded-xl border border-border bg-card open:pb-4">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground">
                    <BookmarkPlus className="h-4 w-4 text-primary" />
                    Separar para un cliente
                  </summary>
                  <form action={separarPieza} className="flex flex-col gap-3 px-4">
                    <input type="hidden" name="producto_id" value={pieza.id} />
                    <input
                      name="cliente_nombre"
                      required
                      placeholder="Nombre del cliente"
                      className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
                    />
                    <input
                      name="cliente_telefono"
                      placeholder="Teléfono (opcional)"
                      className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
                    >
                      Confirmar separado
                    </button>
                  </form>
                </details>
                )}

                {puedeVenderDirecto && (
                <details className="group rounded-xl border border-border bg-card open:pb-4">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground">
                    <ShoppingBag className="h-4 w-4 text-primary" />
                    Vender directamente
                  </summary>
                  <form action={venderPieza} className="flex flex-col gap-3 px-4">
                    <input type="hidden" name="producto_id" value={pieza.id} />
                    {pieza.modo_inventario === 'por_cantidad' && (
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          Cantidad (disponibles: {pieza.stock_disponible ?? 0})
                        </span>
                        <input
                          name="cantidad"
                          type="number"
                          min="1"
                          max={pieza.stock_disponible ?? undefined}
                          step="1"
                          required
                          defaultValue={1}
                          className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
                        />
                      </label>
                    )}
                    <input
                      name="cliente_nombre"
                      required
                      placeholder="Nombre del cliente"
                      className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
                    />
                    <input
                      name="cliente_telefono"
                      placeholder="Teléfono (opcional)"
                      className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
                    />
                    <select
                      name="metodo_pago"
                      required
                      defaultValue=""
                      className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
                    >
                      <option value="" disabled>
                        Método de pago
                      </option>
                      <option value="transferencia">Transferencia</option>
                      <option value="deposito">Depósito</option>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="pasarela">Pasarela</option>
                    </select>
                    <input
                      name="monto"
                      type="number"
                      step="0.01"
                      required
                      defaultValue={pieza.modo_inventario === 'pieza_unica' ? pieza.precio_venta ?? undefined : undefined}
                      placeholder="Monto recibido"
                      className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
                    />
                    <input
                      name="referencia"
                      placeholder="Referencia de pago (opcional)"
                      className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
                    />
                    {puedeDescuentoEmbajador && (
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          Tu descuento personal (%) — sale de tu comisión, opcional
                        </span>
                        <input
                          name="descuento_embajador_pct"
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          placeholder="0"
                          className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
                        />
                      </label>
                    )}
                    <button
                      type="submit"
                      className="rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
                    >
                      Registrar venta
                    </button>
                  </form>
                </details>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
