import { EncabezadoPublico } from './encabezado-publico'

export default function PublicoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <EncabezadoPublico />
      <div className="flex-1">{children}</div>
    </div>
  )
}
