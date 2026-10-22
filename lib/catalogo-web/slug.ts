/** Slug de URL para una categoría ("Anillos de oro" → "anillos-de-oro"). */
export function slug(texto: string) {
  return (
    texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'otros'
  )
}
