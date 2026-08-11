import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'

export const metadata = { title: 'Pedido confirmado — ASTRO' }

export default async function GraciasPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ venta?: string }>
}) {
  const { token } = await params
  const { venta } = await searchParams

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 px-4 py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <CheckCircle2 className="h-7 w-7" />
      </span>
      <h1 className="text-xl font-bold tracking-tight text-foreground">¡Pedido confirmado!</h1>
      <p className="text-sm text-muted-foreground">
        {mensajePedido(venta)} Te contactaremos para confirmar tu pago y coordinar la entrega.
      </p>
      <Link
        href={`/c/${token}`}
        className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
      >
        Seguir viendo el catálogo
      </Link>
    </main>
  )
}

function mensajePedido(venta?: string) {
  return venta ? `Tu pedido #${venta} quedó registrado.` : 'Tu pedido quedó registrado.'
}
