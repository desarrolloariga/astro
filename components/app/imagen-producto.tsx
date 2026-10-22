'use client'

import Image from 'next/image'
import { useState, type CSSProperties } from 'react'
import { miniaturaDe } from '@/lib/imagenes'

/**
 * Foto de producto que llena su contenedor. En calidad "miniatura" pide la
 * versión de 480 px y, si no existe, cae al original.
 */
export function ImagenProducto({
  src,
  alt,
  calidad = 'miniatura',
  sizes = '320px',
  priority = false,
  style,
  className,
}: {
  src: string
  alt: string
  calidad?: 'miniatura' | 'completa'
  sizes?: string
  priority?: boolean
  style?: CSSProperties
  className?: string
}) {
  const [fallo, setFallo] = useState(false)
  const url = calidad === 'miniatura' && !fallo ? miniaturaDe(src) : src
  return (
    <Image
      src={url}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={className}
      style={{ objectFit: 'cover', ...style }}
      onError={() => {
        if (url !== src) setFallo(true)
      }}
    />
  )
}
