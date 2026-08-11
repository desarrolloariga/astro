import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { formatearFechaHora } from '@/lib/formato'
import { EstadoBadge, type ConfigEstado } from '@/components/app/estado-badge'
import { responderTicket, actualizarEstadoTicket } from './acciones'

export const metadata = { title: 'Ticket — ASTRO' }

const estadosTicket: ConfigEstado = {
  abierto: { etiqueta: 'Abierto', clases: 'bg-accent text-accent-foreground' },
  en_proceso: { etiqueta: 'En proceso', clases: 'bg-brand-deep-muted/40 text-brand-deep' },
  resuelto: { etiqueta: 'Resuelto', clases: 'bg-primary/10 text-primary' },
  cerrado: { etiqueta: 'Cerrado', clases: 'bg-muted text-muted-foreground' },
}

type Mensaje = { id: number; mensaje: string; fecha_creacion: string; usuarios: { nombre: string } | null }

export default async function TicketDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  const { id } = await params
  const { error } = await searchParams
  const supabase = await createClient()

  const [{ data: ticket }, { data: mensajes }, { data: adminsData }] = await Promise.all([
    supabase
      .from('tickets')
      .select('id, asunto, descripcion, categoria, estado, usuario_id, asignado_a, fecha_creacion, asignado:asignado_a ( nombre )')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('ticket_mensajes').select('id, mensaje, fecha_creacion, usuarios ( nombre )').eq('ticket_id', id).order('fecha_creacion'),
    usuario.rol === 'admin'
      ? supabase.from('usuarios').select('id, nombre, roles!inner ( nombre )').eq('roles.nombre', 'admin').eq('activo', true)
      : Promise.resolve({ data: [] }),
  ])

  if (!ticket) redirect('/soporte')

  const listaMensajes = (mensajes ?? []) as unknown as Mensaje[]
  const admins = adminsData ?? []
  const asignado = ticket.asignado as unknown as { nombre: string } | null

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
      <Link href="/soporte" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Volver a soporte
      </Link>

      <div>
        <div className="mb-1">
          <EstadoBadge estado={ticket.estado} config={estadosTicket} />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">{ticket.asunto}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{ticket.descripcion}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {ticket.categoria && `${ticket.categoria} · `}
          {formatearFechaHora(ticket.fecha_creacion)}
          {asignado && ` · asignado a ${asignado.nombre}`}
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {usuario.rol === 'admin' && (
        <form action={actualizarEstadoTicket} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="ticket_id" value={ticket.id} />
          <select name="estado" defaultValue={ticket.estado} className="rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
            <option value="abierto">Abierto</option>
            <option value="en_proceso">En proceso</option>
            <option value="resuelto">Resuelto</option>
            <option value="cerrado">Cerrado</option>
          </select>
          <select
            name="asignado_a"
            defaultValue={ticket.asignado_a ?? ''}
            className="rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            <option value="">Sin asignar</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary">
            Actualizar
          </button>
        </form>
      )}

      <div className="flex flex-col gap-3">
        {listaMensajes.map((m) => (
          <div key={m.id} className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs font-semibold text-foreground">{m.usuarios?.nombre}</p>
            <p className="mt-1 text-sm text-muted-foreground">{m.mensaje}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{formatearFechaHora(m.fecha_creacion)}</p>
          </div>
        ))}
      </div>

      {ticket.estado !== 'cerrado' && (
        <form action={responderTicket} className="flex flex-col gap-2">
          <input type="hidden" name="ticket_id" value={ticket.id} />
          <textarea name="mensaje" required rows={3} placeholder="Escribe una respuesta…" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
          <button type="submit" className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
            Enviar
          </button>
        </form>
      )}
    </main>
  )
}
