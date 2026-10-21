'use client'

import { useState } from 'react'

const MAX_TOTAL = 9 * 1024 * 1024

/**
 * Selector de fotos con validación en el navegador: solo imágenes y
 * máximo 9 MB en total por envío (el límite del servidor es 10 MB).
 */
export function InputFotos({ name = 'fotos', maxArchivos = 6 }: { name?: string; maxArchivos?: number }) {
  const [aviso, setAviso] = useState('')

  return (
    <div className="flex flex-col gap-1">
      <input
        name={name}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          const archivos = Array.from(e.target.files ?? [])
          const total = archivos.reduce((a, f) => a + f.size, 0)
          let mensaje = ''
          if (archivos.some((f) => !f.type.startsWith('image/'))) mensaje = 'Solo se permiten imágenes.'
          else if (archivos.length > maxArchivos) mensaje = `Máximo ${maxArchivos} fotos.`
          else if (total > MAX_TOTAL)
            mensaje = `Las fotos pesan ${(total / 1024 / 1024).toFixed(1)} MB; el máximo por envío es 9 MB. Usa fotos más livianas o súbelas en dos veces.`
          setAviso(mensaje)
          if (mensaje) e.target.value = ''
        }}
        className="w-full rounded-lg border border-dashed border-input bg-background px-3 py-2 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-semibold file:text-primary-foreground"
      />
      {aviso && <span className="text-xs font-normal text-destructive">{aviso}</span>}
    </div>
  )
}
