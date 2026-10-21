import { fileURLToPath } from 'node:url'

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // react-pdf usa módulos nativos de Node — no se empaqueta.
  serverExternalPackages: ['@react-pdf/renderer'],
  images: {
    unoptimized: true,
  },
  // Los formularios de checkout/comprobantes suben fotos de comprobantes
  // de pago por server action — el límite por defecto (1 MB) es corto
  // para una foto de celular.
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    // Volver a un módulo visitado hace menos de 30 s es instantáneo (se
    // reutiliza lo ya cargado en el navegador). Cualquier acción que
    // guarde datos (revalidatePath) limpia este caché.
    staleTimes: {
      dynamic: 30,
    },
  },
  turbopack: {
    root: fileURLToPath(new URL('.', import.meta.url)),
  },
}

export default nextConfig
