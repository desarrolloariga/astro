import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'

function celdaCsv(valor: string | number) {
  const texto = String(valor)
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

export async function GET(request: NextRequest) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const periodoId = request.nextUrl.searchParams.get('periodo_id')
  if (!periodoId) {
    return NextResponse.json({ error: 'Falta periodo_id' }, { status: 400 })
  }

  const supabase = await createClient()
  const [{ data: liquidaciones }, { data: periodo }] = await Promise.all([
    supabase
      .from('liquidaciones')
      .select('total, estado, fecha_aprobacion, usuarios ( nombre, correo )')
      .eq('periodo_id', periodoId)
      .order('total', { ascending: false }),
    supabase.from('periodos').select('nombre').eq('id', periodoId).single(),
  ])

  const filas = (liquidaciones ?? []) as unknown as {
    total: number
    estado: string
    fecha_aprobacion: string | null
    usuarios: { nombre: string; correo: string } | null
  }[]

  const encabezado = ['Vendedor', 'Correo', 'Total', 'Estado', 'Fecha de aprobación']
  const lineas = [
    encabezado.join(','),
    ...filas.map((f) =>
      [
        celdaCsv(f.usuarios?.nombre ?? ''),
        celdaCsv(f.usuarios?.correo ?? ''),
        celdaCsv(f.total),
        celdaCsv(f.estado),
        celdaCsv(f.fecha_aprobacion ?? ''),
      ].join(','),
    ),
  ]

  const csv = '﻿' + lineas.join('\r\n')
  const nombreArchivo = `liquidaciones-${periodo?.nombre ?? periodoId}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
    },
  })
}
