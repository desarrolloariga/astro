'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

function formatear(segundos: number) {
  const m = Math.floor(segundos / 60)
  const s = segundos % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function Countdown({ segundosIniciales }: { segundosIniciales: number }) {
  const [segundos, setSegundos] = useState(segundosIniciales)
  const router = useRouter()

  useEffect(() => {
    if (segundos <= 0) {
      router.refresh()
      return
    }
    const id = setTimeout(() => setSegundos((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [segundos, router])

  const porVencer = segundos <= 60

  return (
    <span className={porVencer ? 'font-semibold text-destructive' : 'text-muted-foreground'}>
      Reservada por {formatear(segundos)}
    </span>
  )
}
