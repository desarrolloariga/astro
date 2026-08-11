import Link from "next/link"
import { Package } from "lucide-react"

const columns = [
  {
    title: "Conócenos",
    links: ["Sobre Aurora", "Trabaja con nosotros", "Prensa", "Sostenibilidad"],
  },
  {
    title: "Gana dinero",
    links: ["Vende en Aurora", "Programa de afiliados", "Anuncia tus productos", "Publica tu marca"],
  },
  {
    title: "Ayuda",
    links: ["Tu cuenta", "Estado de pedidos", "Envíos y entregas", "Devoluciones"],
  },
  {
    title: "Administración",
    links: ["Panel administrativo", "Reportes", "Inventario", "Soporte"],
  },
]

export function SiteFooter() {
  return (
    <footer className="mt-10 bg-brand-deep text-brand-deep-foreground">
      <div className="mx-auto grid max-w-[1600px] grid-cols-2 gap-8 px-4 py-12 md:grid-cols-4 md:px-6">
        {columns.map((col) => (
          <div key={col.title}>
            <h3 className="mb-3 text-sm font-bold">{col.title}</h3>
            <ul className="flex flex-col gap-2">
              {col.links.map((link) => (
                <li key={link}>
                  <Link
                    href={link === "Panel administrativo" ? "/admin" : "#"}
                    className="text-sm text-brand-deep-foreground/75 transition-colors hover:text-brand-deep-foreground"
                  >
                    {link}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-brand-deep-foreground/15">
        <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-3 px-4 py-6 md:flex-row md:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-deep-foreground/15">
              <Package className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <span className="text-base font-bold tracking-tight">Aurora</span>
          </div>
          <p className="text-xs text-brand-deep-foreground/70">
            {"© 2026 Aurora Marketplace. Todos los derechos reservados."}
          </p>
        </div>
      </div>
    </footer>
  )
}
