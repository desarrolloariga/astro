const BASE = 'https://api.qrserver.com/v1/create-qr-code/'

/**
 * Genera el QR vía un servicio público (sin dependencias nuevas);
 * al escanearlo abre la url indicada en ASTRO.
 */
export function CodigoQr({
  url,
  size = 160,
  alt = 'Código QR',
}: {
  url: string
  size?: number
  alt?: string
}) {
  const src = `${BASE}?size=${size}x${size}&data=${encodeURIComponent(url)}`
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className="rounded-lg border border-border bg-white p-2"
    />
  )
}
