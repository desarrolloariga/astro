'use client'

import { Plus_Jakarta_Sans } from 'next/font/google'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Bar, Pills } from './piezas'
import {
  AdminSummary,
  BadgeModal,
  Badges,
  HeroAmbassador,
  HowModal,
  Leaderboard,
  LevelPath,
  Podium,
  PrizesCard,
  type Alcance,
} from './secciones'
import { GLOBAL_CSS, Icon, T, btn, nombrePeriodo, type DatosRanking, type LogroRk } from './tokens'

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], display: 'swap' })

const ROLES = [
  { valor: '', etiqueta: 'Todos los roles' },
  { valor: 'embajador', etiqueta: 'Embajador' },
  { valor: 'asesor', etiqueta: 'Asesor' },
  { valor: 'supervisor', etiqueta: 'Supervisor' },
  { valor: 'tienda', etiqueta: 'Tienda' },
]

function alcances(rol: string | undefined): Alcance[] {
  const plural = rol === 'asesor' ? 'asesores' : rol === 'supervisor' ? 'supervisores' : rol === 'tienda' ? 'tiendas' : 'embajadores'
  return [
    { id: 'red', label: 'Mi red', noun: `${plural} de tu red` },
    { id: 'tienda', label: 'Mi tienda', noun: `${plural} en tu tienda` },
    { id: 'rol', label: 'Mi rol', noun: `${plural} en total` },
  ]
}

type Modal = { type: 'how' } | { type: 'badge'; badge: LogroRk } | null

/**
 * Ranking gamificado. Recibe la respuesta de fn_ranking ya anonimizada en
 * la base: para quien no es administración las filas ajenas no traen
 * nombre, tienda, rol ni ids, así que el desenfoque es solo visual.
 */
export function RankingGamificado({ datos, filtros }: { datos: DatosRanking; filtros: { rol: string; tienda: string } }) {
  const router = useRouter()
  const pathname = usePathname()
  const [pendiente, startTransition] = useTransition()
  const [modal, setModal] = useState<Modal>(null)
  const amb = !datos.es_admin
  const scopes = alcances(datos.me?.role)
  const scope = scopes.find((s) => s.id === datos.alcance) ?? scopes[0]
  const periodo = datos.periodo

  const navegar = (cambio: Record<string, string | number | null>) => {
    const p = new URLSearchParams()
    const base: Record<string, string | number | null> = {
      periodo: periodo.id,
      alcance: amb ? datos.alcance : null,
      rol: amb ? null : filtros.rol || null,
      tienda: amb ? null : filtros.tienda || null,
      ...cambio,
    }
    for (const [k, v] of Object.entries(base)) if (v != null && v !== '') p.set(k, String(v))
    startTransition(() => router.push(`${pathname}?${p.toString()}`, { scroll: false }))
  }

  // Días restantes y avance del ciclo (solo en el navegador, para no desfasar con el servidor).
  const [ciclo, setCiclo] = useState({ dias: 0, pct: periodo.en_curso ? 0 : 100 })
  useEffect(() => {
    const ini = new Date(periodo.inicio).getTime()
    const fin = new Date(periodo.fin).getTime()
    const ahora = Date.now()
    setCiclo(
      periodo.en_curso
        ? { dias: Math.max(0, Math.ceil((fin - ahora) / 86_400_000)), pct: Math.min(100, Math.round(((ahora - ini) / Math.max(1, fin - ini)) * 100)) }
        : { dias: 0, pct: 100 },
    )
  }, [periodo.inicio, periodo.fin, periodo.en_curso])

  const etiquetaAlcance = amb ? scope.label : [ROLES.find((r) => r.valor === filtros.rol)?.etiqueta, datos.tiendas.find((t) => String(t.id) === filtros.tienda)?.nombre].filter(Boolean).join(' · ')

  return (
    <div className={`rk ${jakarta.className}`} style={{ background: T.bg, color: T.ink, minHeight: '100%', fontFamily: `${jakarta.style.fontFamily}, system-ui, -apple-system, sans-serif` }}>
      <style>{GLOBAL_CSS}</style>
      <main
        className="rk-main"
        aria-busy={pendiente}
        style={{
          width: '100%', maxWidth: 1080, margin: '0 auto', padding: '32px 32px 64px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 32,
          opacity: pendiente ? 0.6 : 1, transition: 'opacity .2s',
        }}
      >
        {/* Título y controles */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em' }}>Ranking</h1>
            <span style={{ fontSize: 15, color: T.muted }}>Suma puntos con cada venta y escala posiciones. Se reinicia cada ciclo.</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label
              style={{
                display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 6px 0 14px', borderRadius: 999, background: '#fff',
                border: '1px solid #E2E7EF', fontSize: 13, color: T.muted,
              }}
            >
              Ciclo
              <select
                value={periodo.id}
                onChange={(e) => navegar({ periodo: e.target.value })}
                style={{ height: 36, border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: T.ink, cursor: 'pointer' }}
              >
                {datos.periodos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {nombrePeriodo(p)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setModal({ type: 'how' })}
              style={{ ...btn, height: 44, padding: '0 18px', gap: 8, borderRadius: 999, background: T.blue, color: '#fff', fontSize: 14, fontWeight: 700 }}
            >
              <Icon name="bolt" size={17} stroke={2} /> ¿Cómo gano puntos?
            </button>
          </div>
        </div>

        {/* Alcance + ciclo */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          {amb ? (
            <Pills label="Alcance del ranking" options={scopes} value={scope.id} onChange={(id) => navegar({ alcance: id })} />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <select
                aria-label="Filtrar por rol"
                value={filtros.rol}
                onChange={(e) => navegar({ rol: e.target.value || null })}
                style={{ height: 40, padding: '0 12px', borderRadius: 999, border: '1px solid #E2E7EF', background: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: T.ink }}
              >
                {ROLES.map((r) => (
                  <option key={r.valor} value={r.valor}>
                    {r.etiqueta}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filtrar por tienda"
                value={filtros.tienda}
                onChange={(e) => navegar({ tienda: e.target.value || null })}
                style={{ height: 40, padding: '0 12px', borderRadius: 999, border: '1px solid #E2E7EF', background: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: T.ink }}
              >
                <option value="">Todas las tiendas</option>
                {datos.tiendas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div style={{ flex: '0 1 380px', minWidth: 240, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: periodo.en_curso ? T.green : T.neutral }} />
                {periodo.en_curso ? 'Ciclo en curso' : 'Ciclo cerrado'} · {nombrePeriodo(periodo)}
              </span>
              <span style={{ color: T.muted }}>
                {periodo.en_curso ? (ciclo.dias <= 1 ? 'Termina hoy' : ciclo.dias === 2 ? 'Termina mañana' : `Termina en ${ciclo.dias} días`) : 'Resultados finales'}
              </span>
            </div>
            <Bar pct={ciclo.pct} color={T.blue} height={6} bg="#E5E9F0" />
          </div>
        </div>

        {amb && datos.me ? (
          <HeroAmbassador
            key={`${periodo.id}-${datos.alcance}`}
            me={datos.me}
            total={datos.total}
            rows={datos.rows}
            niveles={datos.niveles}
            racha={datos.racha}
            scope={scope}
            live={periodo.en_curso}
            onHow={() => setModal({ type: 'how' })}
          />
        ) : (
          !amb && <AdminSummary rows={datos.rows} total={datos.total} scopeLabel={etiquetaAlcance || 'Toda la red'} />
        )}

        <Podium rows={datos.rows} amb={amb} premios={datos.premios} />
        <Leaderboard key={`${periodo.id}-${datos.alcance}-${filtros.rol}-${filtros.tienda}`} rows={datos.rows} me={datos.me} total={datos.total} amb={amb} niveles={datos.niveles} />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>
          <PrizesCard me={datos.me} rows={datos.rows} amb={amb} premios={datos.premios} />
          <LevelPath pts={datos.me?.pts ?? datos.mis_puntos} amb={amb} niveles={datos.niveles} />
        </div>

        <Badges list={datos.logros} amb={amb} onOpen={(b) => setModal({ type: 'badge', badge: b })} />
      </main>

      {modal?.type === 'how' && <HowModal reglas={datos.reglas} onClose={() => setModal(null)} />}
      {modal?.type === 'badge' && <BadgeModal badge={modal.badge} onClose={() => setModal(null)} />}
    </div>
  )
}
