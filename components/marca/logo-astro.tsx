import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * Logotipo e isotipo oficiales de ASTRO (Manual de Marca, nov 2026).
 * Solo los PNG de /astro/brand: no se redibujan, recolorean ni se les aplican efectos.
 *   principal → negro con carrito naranja, sobre fondos blancos o claros
 *   negativo  → blanco, sobre negro o naranja
 *   naranja   → naranja, sobre negro o blanco
 * Tamaño mínimo digital: logotipo 60 px de ancho, isotipo 16 px.
 */
type Version = 'principal' | 'negativo' | 'naranja'

export function LogoAstro({ version = 'principal', ancho = 120, className, prioridad }: { version?: Version; ancho?: number; className?: string; prioridad?: boolean }) {
  const w = Math.max(ancho, 60)
  return (
    <Image
      src={`/astro/brand/logo-${version}.png`}
      alt="ASTRO"
      width={w}
      height={Math.round((w * 174) / 900)}
      priority={prioridad}
      className={cn('h-auto select-none', className)}
    />
  )
}

export function IsotipoAstro({ version = 'principal', ancho = 32, className }: { version?: Version; ancho?: number; className?: string }) {
  const w = Math.max(ancho, 16)
  return (
    <Image
      src={`/astro/brand/isotipo-${version}.png`}
      alt="ASTRO"
      width={w}
      height={Math.round((w * 317) / 400)}
      className={cn('h-auto select-none', className)}
    />
  )
}
