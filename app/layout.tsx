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
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    apple: '/apple-icon.png',
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
