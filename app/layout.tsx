import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
import { PwaRegister } from '@/components/pwa-register'
import './globals.css'

const fuenteMarca = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-marca',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'ASTRO — Ecosistema Comercial Digital',
  description:
    'Plataforma comercial de ASTRO Joyería: producción, inventario, catálogo, ventas e incentivos.',
  generator: 'v0.app',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ASTRO',
  },
  // Isotipo principal ASTRO (carrito negro con franjas naranjas sobre blanco).
  icons: {
    icon: [
      { url: '/astro-icono-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/astro-icono-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/astro-icono-96.png', sizes: '96x96', type: 'image/png' },
      { url: '/astro-icono-192.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/astro-icono-180.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#F6A637',
  width: 'device-width',
  initialScale: 1,
  // Ocupa toda la pantalla del iPhone; las barras usan env(safe-area-inset-*)
  // para no quedar debajo de la isla dinámica ni del indicador de inicio.
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={`light ${fuenteMarca.variable} bg-background`}>
      <body className="antialiased font-sans">
        {children}
        <PwaRegister />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
