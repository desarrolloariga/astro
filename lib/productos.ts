/** Prefijo de código: primeras 3 letras del nombre de la categoría (sin acentos/espacios). */
export function prefijoDesdeCategoria(nombreCategoria: string | null | undefined): string {
  if (!nombreCategoria) return 'ART'
  const limpio = nombreCategoria
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  return limpio.slice(0, 3) || 'ART'
}
