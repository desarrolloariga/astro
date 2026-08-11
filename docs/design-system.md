# Sistema de diseño y paleta de colores

Este documento describe la base visual **ya implementada** en el proyecto (heredada del scaffold
"Aurora — Tienda en línea" generado con v0.app). Sirve como referencia obligatoria para cualquier
pantalla o componente nuevo que se construya sobre este proyecto: la idea es mantener consistencia
visual aunque la aplicación final tenga un propósito distinto al de la tienda de ejemplo.

## Stack visual

- **Framework de estilos:** Tailwind CSS v4 (`@import 'tailwindcss'` en [app/globals.css](../app/globals.css)), sin archivo `tailwind.config` — todo el theming vive en CSS con `@theme inline`.
- **Componentes base:** [shadcn/ui](https://ui.shadcn.com), estilo `base-nova` (ver [components.json](../components.json)), color base `neutral`, sin prefijo de clases.
- **Primitivas headless:** `@base-ui/react` (usado por ejemplo en [components/ui/button.tsx](../components/ui/button.tsx) vía `class-variance-authority`).
- **Iconografía:** `lucide-react`.
- **Tipografía:** Google Font **Inter**, cargada en [app/layout.tsx](../app/layout.tsx) como variable `--font-inter` y mapeada a `--font-sans`.
- **Animaciones utilitarias:** `tw-animate-css`.
- **Radios:** escala derivada de una sola variable base `--radius: 0.625rem` (`sm` a `4xl`, ver `@theme inline` en `globals.css`).

El layout raíz fuerza el tema **claro** (`className="light"` en `<html>`, `viewport.colorScheme = 'light'`). Existen tokens de modo oscuro completos y un bloque `@media (prefers-color-scheme: dark)`, pero **no están activos en producción todavía** — quedan disponibles para cuando se decida soportar dark mode.

## Paleta de colores (tema claro — el activo)

Todos los colores están definidos como variables CSS en formato **OKLCH** en `:root` dentro de
[app/globals.css](../app/globals.css). La tabla incluye el valor OKLCH original (fuente de verdad)
y un hex aproximado (útil para Figma / herramientas externas, pero puede perder algo de precisión
perceptual respecto al OKLCH).

| Token | OKLCH | Hex aprox. | Uso |
|---|---|---|---|
| `background` | `oklch(0.985 0.006 240)` | `#F7FBFE` | Fondo general de la app |
| `foreground` | `oklch(0.28 0.045 250)` | `#172A3E` | Texto principal |
| `card` | `oklch(1 0 0)` | `#FFFFFF` | Fondo de tarjetas, barras superiores |
| `primary` | `oklch(0.62 0.12 250)` | `#488ACB` | Color de marca / acción principal (botones, links activos, iconos destacados) |
| `primary-foreground` | `oklch(0.99 0.005 240)` | `#F9FCFF` | Texto/iconos sobre `primary` |
| `brand-deep` | `oklch(0.4 0.1 255)` | `#1D487C` | Azul intermedio para barras de navegación secundarias |
| `brand-deep-muted` | `oklch(0.78 0.06 250)` | `#9BBBDD` | Variante suave de `brand-deep` |
| `brand-deeper` | `oklch(0.25 0.12 258)` | `#001B59` | Azul más oscuro, franja de navegación inferior en topbars |
| `secondary` | `oklch(0.95 0.02 240)` | `#E3F1FB` | Fondos secundarios, hover neutro |
| `muted` | `oklch(0.955 0.014 240)` | `#E8F2F9` | Fondos apagados (placeholders de imagen, etc.) |
| `muted-foreground` | `oklch(0.58 0.03 250)` | `#6D7C8C` | Texto secundario / metadatos |
| `accent` | `oklch(0.9 0.05 235)` | `#BFE4FB` | Resaltados suaves (badges, iconos en círculo) |
| `accent-foreground` | `oklch(0.32 0.07 250)` | `#133555` | Texto/iconos sobre `accent` |
| `destructive` | `oklch(0.577 0.245 27.325)` | `#E7000B` | Errores, alertas, acciones destructivas |
| `border` / `input` | `oklch(0.91 0.02 240)` | `#D6E3EE` | Bordes y contornos de inputs |
| `ring` | `oklch(0.62 0.12 250)` | `#488ACB` | Anillo de foco (mismo tono que `primary`) |
| `chart-1..5` | ver `globals.css` | `#488ACB` `#4AADC9` `#77C6D4` `#4A71B1` `#AFD4EA` | Serie de colores para gráficas (degradado de azules/turquesas) |
| `sidebar` | `oklch(0.99 0.008 240)` | `#F7FDFF` | Fondo del sidebar (tienda/admin) |
| `sidebar-accent` | `oklch(0.93 0.035 240)` | `#D4ECFD` | Ítem activo del sidebar |

**Regla de paleta:** todo el sistema es monocromático en azul (hue ~210–260 en OKLCH), variando solo
luminosidad (L) y croma (C). El único color fuera de esa familia es `destructive` (rojo), reservado
exclusivamente para errores/alertas. Si se necesitan nuevos colores semánticos (éxito, advertencia,
info), seguir el mismo patrón: definir la variable en `:root`/`.dark`, mapearla en `@theme inline`
como `--color-<nombre>` y `--color-<nombre>-foreground`.

## Convenciones de uso (extraídas de los componentes existentes)

- **Nunca usar colores hardcodeados** (`bg-[#...]`, `text-blue-500`, etc.) — siempre clases semánticas de Tailwind que resuelven a las variables: `bg-primary`, `text-muted-foreground`, `border-border`, etc.
- **Botones primarios:** `bg-primary text-primary-foreground` + `hover:opacity-90` (no se oscurece el color, se baja opacidad).
- **Botones neutros/outline:** `border border-border bg-card` (o `bg-background`) + `hover:bg-secondary`.
- **Tarjetas:** `rounded-xl border border-border bg-card p-4/5`, sombra solo on-hover (`hover:shadow-md`), sin sombra por defecto.
- **Badges/pills:** `rounded-full` con fondo `bg-primary/10` y texto `text-primary` (estado positivo), o `bg-destructive/10 text-destructive` (estado negativo). El patrón `color/10` + `text-color` es el estándar para estados suaves.
- **Barras superiores (topbar) de dos niveles:** un bloque blanco (`bg-card/90 backdrop-blur`) con buscador/acciones, seguido de una franja `bg-brand-deep` / `bg-brand-deeper` con navegación secundaria o métricas rápidas. Ver [components/store-topbar.tsx](../components/store-topbar.tsx) y [components/admin/admin-topbar.tsx](../components/admin/admin-topbar.tsx).
- **Sidebar (panel admin):** fondo `bg-sidebar`, ítem activo `bg-sidebar-accent text-sidebar-accent-foreground`, resto `text-sidebar-foreground/80` con hover `bg-sidebar-accent/60`.
- **Gráficas / KPIs:** barras y sparklines usan `bg-primary` para la serie principal y `bg-chart-2` a `bg-chart-5` para series secundarias; nunca colores fuera de esos tokens.
- **Radios:** `rounded-lg`/`rounded-xl` para tarjetas y botones, `rounded-full` para pills, avatares y indicadores.
- **Idioma y formato:** copy en español (es-GT), precios formateados con `toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' })`.

## Cómo extender esta base

1. Cualquier color nuevo se declara como variable OKLCH en `:root` (y en `.dark` si aplica) dentro de `app/globals.css`, y se expone en el bloque `@theme inline` con el prefijo `--color-`.
2. Componentes nuevos deben construirse con `class-variance-authority` (CVA) siguiendo el patrón de [components/ui/button.tsx](../components/ui/button.tsx) cuando tengan variantes.
3. Para agregar componentes shadcn adicionales, usar el CLI (`pnpm dlx shadcn@latest add <componente>`) — respetará automáticamente `components.json` (estilo `base-nova`, alias `@/components`, etc.).
4. Mantener el tema oscuro sincronizado (los tokens ya existen) aunque no esté activo, por si se habilita más adelante.

> Este documento describe la base visual heredada, no el producto final. El propósito real de la
> aplicación, sus pantallas y funcionalidades se documentan en [app-context.md](./app-context.md) y
> se actualizará cuando se comparta el plan del producto.
