'use client'

import { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'

/**
 * Firma virtual sobre canvas (mouse, dedo o lápiz). Escribe la firma
 * como data URL PNG en un input oculto `name` cada vez que se termina un
 * trazo; vacío mientras no se haya firmado.
 */
export function FirmaCanvas({ name = 'firma', alto = 160 }: { name?: string; alto?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dibujando = useRef(false)
  const [valor, setValor] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Resolución real = tamaño en pantalla × densidad de píxeles.
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0b2545'
  }, [])

  function punto(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function iniciar(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dibujando.current = true
    const p = punto(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = punto(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  function terminar() {
    if (!dibujando.current) return
    dibujando.current = false
    setValor(canvasRef.current?.toDataURL('image/png') ?? '')
  }

  function limpiar() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setValor('')
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        style={{ height: alto, touchAction: 'none' }}
        className="w-full cursor-crosshair rounded-lg border border-dashed border-input bg-white"
        onPointerDown={iniciar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerLeave={terminar}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{valor ? 'Firma capturada' : 'Firma dentro del recuadro'}</span>
        <button
          type="button"
          onClick={limpiar}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <Eraser className="h-3.5 w-3.5" />
          Borrar
        </button>
      </div>
      <input type="hidden" name={name} value={valor} />
    </div>
  )
}
