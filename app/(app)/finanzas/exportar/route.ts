import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'

function celdaCsv(valor: string | number) {
  const texto = String(valor)
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

export async function GET(request: NextRequest) {
  if (!(await tienePermiso('finanzas', 'ver'))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('vw_ventas_kpi')
    .select('id, fecha_creacion, canal, tienda, vendedor, subtotal, descuento_desempeno, total, estado')
    .order('fecha_creacion', { ascending: false })
    .limit(5000)

  const filas = (data ?? []) as {
    id: number
    fecha_creacion: string
    canal: string
    tienda: string | null
    vendedor: string
    subtotal: number
    descuento_desempeno: number
    total: number
    estado: string
  }[]

  const encabezado = ['ID venta', 'Fecha', 'Canal', 'Tienda', 'Vendedor', 'Subtotal', 'Descuento', 'Total', 'Estado']
  const lineas = [
    encabezado.join(','),
    ...filas.map((f) =>
      [
        celdaCsv(f.id),
        celdaCsv(f.fecha_creacion),
        celdaCsv(f.canal),
        celdaCsv(f.tienda ?? ''),
        celdaCsv(f.vendedor),
        celdaCsv(f.subtotal),
        celdaCsv(f.descuento_desempeno),
        celdaCsv(f.total),
        celdaCsv(f.estado),
      ].join(','),
    ),
  ]

  const csv = '﻿' + lineas.join('\r\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ventas-astro.csv"`,
    },
  })
}
