'use client'

import { useActionState, useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { registrarEmbajador, type EstadoRegistro } from '@/app/(publico)/registro/[token]/acciones'

const campo =
  'h-12 w-full rounded-full border-2 border-black bg-white px-5 text-base text-black outline-none transition-colors placeholder:text-black/40 focus:border-[#F6A637]'

export function FormularioRegistro({ token }: { token: string }) {
  const [estado, accion, enviando] = useActionState<EstadoRegistro, FormData>(registrarEmbajador.bind(null, token), {})
  const [ver, setVer] = useState(false)
  const v = estado.valores

  return (
    <form action={accion} className="flex flex-col gap-4">
      {/* Campo trampa para bots: oculto a las personas */}
      <input type="text" name="empresa" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />

      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Nombre y apellido
        <input name="nombre" required autoComplete="name" defaultValue={v?.nombre} placeholder="Ej. Ana López" className={campo} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Correo electrónico
        <input name="correo" type="email" required autoComplete="email" defaultValue={v?.correo} placeholder="tucorreo@ejemplo.com" className={campo} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        WhatsApp
        <input name="telefono" type="tel" required autoComplete="tel" inputMode="tel" defaultValue={v?.telefono} placeholder="5555 5555" className={campo} />
      </label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Contraseña
          <span className="relative">
            <input name="contrasena" type={ver ? 'text' : 'password'} required minLength={8} autoComplete="new-password" placeholder="Mínimo 8 caracteres" className={`${campo} pr-12`} />
            <button
              type="button"
              onClick={() => setVer((x) => !x)}
              aria-label={ver ? 'Ocultar contraseña' : 'Ver contraseña'}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-black/60 hover:text-black"
            >
              {ver ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Confirma la contraseña
          <input name="confirmar" type={ver ? 'text' : 'password'} required minLength={8} autoComplete="new-password" className={campo} />
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="acepto" required className="mt-1 h-4 w-4 accent-[#F6A637]" />
        <span>Acepto que ASTRO use mis datos para crear mi cuenta de embajador y contactarme por WhatsApp y correo.</span>
      </label>

      {estado.error && (
        <p role="alert" className="rounded-2xl border-2 border-black bg-[#FFF4E3] px-4 py-3 text-sm font-semibold text-black">
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="mt-1 inline-flex h-13 items-center justify-center gap-2 rounded-full bg-[#F6A637] px-6 py-4 text-sm font-black uppercase tracking-wider text-black transition-colors hover:bg-black hover:text-[#F6A637] disabled:opacity-60"
      >
        {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
        {enviando ? 'Creando tu cuenta…' : 'Quiero ser embajador'}
      </button>
    </form>
  )
}
