'use client'

import { useEffect, useState } from 'react'

/** Cuenta regresiva al lanzamiento (medianoche de Guatemala del día indicado). */
export function CuentaRegresiva({ fecha }: { fecha: string }) {
  const objetivo = new Date(`${fecha}T00:00:00-06:00`).getTime()
  const [ahora, setAhora] = useState<number | null>(null)
  useEffect(() => {
    setAhora(Date.now())
    const t = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (ahora == null) return null
  const resta = Math.max(objetivo - ahora, 0)
  if (resta === 0) return <p className="text-lg font-black text-[#F6A637]">¡Las puertas del Universo ASTRO ya están abiertas!</p>
  const partes = [
    { v: Math.floor(resta / 86_400_000), e: 'días' },
    { v: Math.floor((resta / 3_600_000) % 24), e: 'horas' },
    { v: Math.floor((resta / 60_000) % 60), e: 'min' },
    { v: Math.floor((resta / 1000) % 60), e: 'seg' },
  ]
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">El lanzamiento comienza en</p>
      <div className="flex gap-2" aria-live="off">
        {partes.map((p) => (
          <span key={p.e} className="flex min-w-16 flex-col items-center rounded-2xl border border-white/15 bg-white/5 px-3 py-2">
            <span className="text-3xl font-black tabular-nums text-[#F6A637]">{String(p.v).padStart(2, '0')}</span>
            <span className="text-[11px] uppercase tracking-wider text-white/60">{p.e}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
