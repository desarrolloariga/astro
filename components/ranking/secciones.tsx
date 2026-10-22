'use client'

import { useMemo, useState } from 'react'
import { Avatar, Bar, CloseBtn, Modal, Person, Pills, useCountUp } from './piezas'
import {
  ICONS,
  Icon,
  MASKS,
  MEDALS,
  T,
  btn,
  card,
  fmt,
  h2,
  iconoValido,
  moveColor,
  moveIcon,
  moveLabel,
  nivelDe,
  tonoNivel,
  type Fila,
  type LogroRk,
  type NivelRk,
  type PremioRk,
  type ReglaRk,
} from './tokens'

export type Alcance = { id: 'red' | 'tienda' | 'rol'; label: string; noun: string }

/* ---------------- Héroe del embajador ---------------- */

export function HeroAmbassador({
  me,
  total,
  rows,
  niveles,
  racha,
  scope,
  live,
  onHow,
}: {
  me: Fila
  total: number
  rows: Fila[]
  niveles: NivelRk[]
  racha: number
  scope: Alcance
  live: boolean
  onHow: () => void
}) {
  const { nivel: lvl, siguiente: next, esMaximo } = nivelDe(niveles, me.pts)
  const animPts = useCountUp(me.pts)
  const above = me.pos > 1 ? rows[me.pos - 2] : null
  const third = rows[2]
  const percentile = Math.max(1, Math.round((me.pos / Math.max(1, total)) * 100))

  const goals: { title: string; right: string; color: string; bar: string; pct: number; hint: string }[] = []
  if (above) {
    goals.push({
      title: `Superar el puesto #${above.pos}`,
      right: `Te faltan ${fmt(above.pts - me.pts + 1)} pts`,
      color: T.blue,
      bar: T.blue,
      pct: (me.pts / (above.pts + 1)) * 100,
      hint: 'Con una o dos ventas más lo alcanzas.',
    })
  } else {
    goals.push({ title: 'Mantener el primer lugar', right: '¡Vas líder!', color: T.green, bar: T.green, pct: 100, hint: 'Sigue sumando para no perder la corona.' })
  }
  if (me.pos > 3 && third) {
    goals.push({
      title: 'Entrar al podio',
      right: `Te faltan ${fmt(third.pts - me.pts + 1)} pts`,
      color: '#B7791F',
      bar: MEDALS[0].c,
      pct: (me.pts / (third.pts + 1)) * 100,
      hint: 'El podio recibe premio especial del ciclo.',
    })
  }
  goals.push({
    title: esMaximo ? `Nivel ${lvl.name}` : `Subir a nivel ${next.name}`,
    right: esMaximo ? 'Nivel máximo' : `Te faltan ${fmt(next.min - me.pts)} pts`,
    color: T.muted,
    bar: next.color,
    pct: esMaximo ? 100 : ((me.pts - lvl.min) / Math.max(1, next.min - lvl.min)) * 100,
    hint: 'Cada nivel desbloquea beneficios.',
  })

  const stat = { flex: '1 1 140px', padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column' as const, gap: 4 }

  return (
    <section aria-label="Tu posición" style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
      <div style={{ flex: '1 1 400px', minWidth: 0, position: 'relative', overflow: 'hidden', borderRadius: 28, background: T.navy, color: '#fff', padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Icon name="trophy" size={260} stroke={0.8} color={T.navyLine} style={{ position: 'absolute', right: -40, bottom: -50 }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#B9C8E8' }}>
            {live ? 'Tu posición' : 'Terminaste en'} · {scope.label}
          </span>
          <span
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
              background: me.move > 0 ? 'rgba(34,160,107,0.18)' : 'rgba(255,255,255,0.1)', color: me.move > 0 ? '#7EE2B1' : '#DCE6FA',
            }}
          >
            <Icon name={moveIcon(me.move)} size={14} stroke={2.4} />
            {me.move > 0 ? `Subiste ${me.move} puestos esta semana` : me.move < 0 ? `Bajaste ${-me.move} puestos esta semana` : 'Sin cambios esta semana'}
          </span>
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
          <span className="rk-pos" style={{ fontSize: 88, lineHeight: 0.85, fontWeight: 800, letterSpacing: '-0.04em', color: T.gold }}>
            #{me.pos}
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 4 }}>
            <span style={{ fontSize: 15, color: '#DCE6FA' }}>
              de {total} {scope.noun}
            </span>
            <span style={{ fontSize: 13, color: '#B9C8E8' }}>Estás en el {percentile}% superior</span>
          </span>
        </div>
        <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <div style={stat}>
            <span style={{ fontSize: 12, color: '#B9C8E8' }}>Puntos del ciclo</span>
            <span aria-live="polite" style={{ fontSize: 26, fontWeight: 800 }}>
              {fmt(animPts)} pts
            </span>
          </div>
          <div style={stat}>
            <span style={{ fontSize: 12, color: '#B9C8E8' }}>Nivel</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 800 }}>
              <span style={{ width: 26, height: 26, borderRadius: 13, background: lvl.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="star" size={14} fill="#fff" />
              </span>
              {lvl.name}
            </span>
          </div>
          <div style={stat}>
            <span style={{ fontSize: 12, color: '#B9C8E8' }}>Racha de ventas</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 800 }}>
              <Icon name="flame" size={20} fill="#F59E0B" /> {racha} {racha === 1 ? 'día' : 'días'}
            </span>
          </div>
        </div>
      </div>

      <div style={{ ...card, flex: '1 1 340px', minWidth: 0, padding: 28, display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 36, height: 36, borderRadius: 12, background: '#FFF6DD', color: '#B7791F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="target" size={19} stroke={1.9} />
          </span>
          <span style={{ fontSize: 17, fontWeight: 800 }}>Tus próximos objetivos</span>
        </div>
        {goals.map((g) => (
          <div key={g.title} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{g.title}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: g.color }}>{g.right}</span>
            </div>
            <Bar pct={g.pct} color={g.bar} />
            <span style={{ fontSize: 12, color: T.muted }}>{g.hint}</span>
          </div>
        ))}
        <button type="button" onClick={onHow} style={{ ...btn, alignSelf: 'flex-start', height: 36, gap: 6, color: T.blue, fontSize: 14, fontWeight: 700 }}>
          Ver cómo sumar más puntos <Icon name="arrowRight" size={16} stroke={2.2} />
        </button>
      </div>
    </section>
  )
}

/* ---------------- Resumen de administración ---------------- */

export function AdminSummary({ rows, total, scopeLabel }: { rows: Fila[]; total: number; scopeLabel: string }) {
  const sum = rows.reduce((a, r) => a + r.pts, 0)
  const lider = rows[0]
  const stats = [
    { label: 'Participantes', value: fmt(total), sub: scopeLabel, icon: 'users' as const },
    { label: 'Puntos del ciclo', value: fmt(sum), sub: 'Suma de todos', icon: 'sum' as const },
    { label: 'Promedio', value: fmt(total ? sum / total : 0), sub: 'Puntos por persona', icon: 'avg' as const },
    { label: 'Líder', value: lider ? `${fmt(lider.pts)} pts` : '—', sub: lider?.name ?? '—', icon: 'crown' as const },
  ]
  return (
    <section aria-label="Resumen del ciclo" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 16 }}>
      {stats.map((s) => (
        <div key={s.label} style={{ ...card, borderRadius: 22, padding: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.muted }}>
            <Icon name={s.icon} size={16} stroke={1.9} color={T.blue} /> {s.label}
          </span>
          <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em' }}>{s.value}</span>
          <span style={{ fontSize: 12, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.sub}</span>
        </div>
      ))}
    </section>
  )
}

/* ---------------- Podio ---------------- */

export function Podium({ rows, amb, premios }: { rows: Fila[]; amb: boolean; premios: PremioRk[] }) {
  const heights = [150, 110, 84]
  const premioPos = (pos: number) => premios.find((p) => p.tipo === 'posicion' && p.maxPos != null && pos <= p.maxPos)?.prize
  if (rows.length === 0) return null
  return (
    <section aria-labelledby="rk-podio" style={{ ...card, padding: 28, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 id="rk-podio" style={h2}>
          Podio del ciclo
        </h2>
        {amb && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, background: T.soft, fontSize: 12, color: T.muted }}>
            <Icon name="lock" size={15} stroke={1.9} /> Los nombres de los demás son privados
          </span>
        )}
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 16 }}>
        {[0, 1, 2].map((idx) => {
          const r = rows[idx]
          if (!r) return null
          const m = MEDALS[idx]
          const yo = r.isMe && amb
          return (
            <li
              key={idx}
              aria-label={`Puesto ${idx + 1}`}
              style={{ flex: '1 1 0', maxWidth: 240, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, order: idx === 0 ? 2 : idx === 1 ? 1 : 3 }}
            >
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                {idx === 0 && (
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="#F2C94C" stroke="#C99A0B" strokeWidth="1.2" strokeLinejoin="round" aria-hidden="true">
                    <path d={ICONS.crown} />
                  </svg>
                )}
                <Avatar name={yo ? 'Tú' : r.name} mask={MASKS[idx]} colorIdx={idx + 1} size={idx === 0 ? 88 : 72} border={`4px solid ${m.c}`} fontSize={20} />
                <span
                  style={{
                    position: 'absolute', bottom: -8, right: 2, width: 28, height: 28, borderRadius: 14, background: m.c, color: '#fff', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, border: '3px solid #fff',
                  }}
                >
                  {idx + 1}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, textAlign: 'center', minWidth: 0, maxWidth: '100%' }}>
                <Person name={r.name} mask={MASKS[idx]} isMe={yo} weight={700} />
                <span style={{ fontSize: 13, color: T.muted }}>{fmt(r.pts)} pts</span>
              </div>
              <div
                style={{
                  width: '100%', height: heights[idx], borderRadius: '18px 18px 6px 6px', background: m.base, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', paddingTop: 16, boxSizing: 'border-box', gap: 6, transformOrigin: 'bottom', animation: `rk-rise .5s ${0.1 * idx}s both ease-out`,
                }}
              >
                <Icon name="medal" size={30} stroke={1.7} color={m.c} />
                {premioPos(idx + 1) && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: m.t, textAlign: 'center', padding: '0 6px' }}>{premioPos(idx + 1)}</span>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/* ---------------- Tabla de posiciones ---------------- */

type Item = Fila | { sep: true; text: string; key: string }

export function Leaderboard({ rows, me, total, amb, niveles }: { rows: Fila[]; me: Fila | null; total: number; amb: boolean; niveles: NivelRk[] }) {
  const [view, setView] = useState<'around' | 'top'>(amb && me ? 'around' : 'top')
  const [showAll, setShowAll] = useState(false)
  const cols = '64px minmax(0, 1fr) 110px 110px 130px'

  const items = useMemo(() => {
    const out: Item[] = []
    const sep = (text: string): Item => ({ sep: true, text, key: `sep-${text}` })
    if (view === 'around' && me) {
      const a = Math.max(0, me.pos - 4)
      const b = Math.min(total, me.pos + 3)
      if (a > 0) out.push(sep(`${a} ${a === 1 ? 'posición' : 'posiciones'} más arriba`))
      rows.slice(a, b).forEach((r) => out.push(r))
      if (b < total) out.push(sep(`${total - b} ${total - b === 1 ? 'posición' : 'posiciones'} más abajo`))
    } else {
      rows.slice(0, !amb && showAll ? total : 10).forEach((r) => out.push(r))
      if (amb && me && me.pos > 10) {
        out.push(sep('···'))
        out.push(me)
      }
    }
    return out
  }, [view, rows, me, total, amb, showAll])

  const gap = (r: Fila) => {
    if (amb && me) {
      if (r.isMe) return { text: 'Estás aquí', color: T.blue }
      const d = r.pts - me.pts
      return d > 0 ? { text: `+${fmt(d)} sobre ti`, color: T.muted } : { text: `${fmt(-d)} detrás de ti`, color: T.green }
    }
    return r.pos === 1 ? { text: 'Líder', color: T.muted } : { text: `−${fmt((rows[0]?.pts ?? 0) - r.pts)} del líder`, color: T.muted }
  }

  const views: { id: 'around' | 'top'; label: string }[] = amb
    ? [
        { id: 'around', label: 'Alrededor de mí' },
        { id: 'top', label: 'Top 10' },
      ]
    : me
      ? [
          { id: 'top', label: 'Top 10' },
          { id: 'around', label: 'Alrededor de mí' },
        ]
      : [{ id: 'top', label: 'Top 10' }]

  return (
    <section aria-labelledby="rk-board" style={{ ...card, overflow: 'hidden' }}>
      <div style={{ padding: '22px 28px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: `1px solid ${T.line}` }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h2 id="rk-board" style={h2}>
            Tabla de posiciones
          </h2>
          <span style={{ fontSize: 13, color: T.muted }}>{amb ? 'Solo ves tu nombre; los demás aparecen ocultos.' : `${total} participantes`}</span>
        </div>
        {views.length > 1 && (
          <Pills
            label="Vista de la tabla"
            options={views}
            value={view}
            onChange={(v) => {
              setView(v)
              setShowAll(false)
            }}
            bg={T.soft}
            height={34}
          />
        )}
      </div>

      <div role="table" aria-label="Posiciones" style={{ display: 'flex', flexDirection: 'column', overflowX: 'auto', paddingBottom: 4 }}>
        <div
          role="row"
          style={{
            minWidth: 600, display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '12px 28px', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase', color: T.faint,
          }}
        >
          <span role="columnheader">#</span>
          <span role="columnheader">{amb ? 'Participante' : 'Vendedor'}</span>
          <span role="columnheader">Nivel</span>
          <span role="columnheader" style={{ textAlign: 'right' }}>
            Puntos
          </span>
          <span role="columnheader" style={{ textAlign: 'right' }}>
            {amb ? 'Diferencia' : 'Al líder'}
          </span>
        </div>
        {items.length === 0 && <div style={{ padding: '24px 28px', fontSize: 14, color: T.muted }}>Aún no hay participantes en este ciclo.</div>}
        {items.map((r) => {
          if ('sep' in r) {
            return (
              <div key={r.key} role="row" style={{ padding: '8px 28px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: T.faint }}>
                <span style={{ flex: 1, height: 1, background: T.line }} />
                {r.text}
                <span style={{ flex: 1, height: 1, background: T.line }} />
              </div>
            )
          }
          const highlight = r.isMe
          const top = r.pos <= 3
          const lv = nivelDe(niveles, r.pts).nivel
          const tono = tonoNivel(lv.color)
          const g = gap(r)
          const mask = MASKS[r.pos % MASKS.length]
          return (
            <div
              key={`${r.pos}-${r.isMe}`}
              role="row"
              aria-current={highlight ? 'true' : undefined}
              style={{
                minWidth: 576, display: 'grid', gridTemplateColumns: cols, gap: 12, alignItems: 'center', padding: '12px 28px',
                margin: highlight ? '4px 12px' : 0, borderRadius: highlight ? 18 : 0, background: highlight ? T.blueSoft : '#fff',
                borderTop: highlight ? 'none' : `1px solid ${T.lineSoft}`, boxShadow: highlight ? '0 6px 18px rgba(36,83,214,0.15)' : 'none',
              }}
            >
              <span role="cell" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    minWidth: 32, height: 32, padding: '0 6px', boxSizing: 'border-box', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 800, background: top ? MEDALS[r.pos - 1].c : highlight ? T.blue : T.lineSoft, color: top || highlight ? '#fff' : T.body,
                  }}
                >
                  {r.pos}
                </span>
                <Icon name={moveIcon(r.move)} size={12} stroke={3} color={moveColor(r.move)} label={moveLabel(r.move)} />
              </span>
              <span role="cell" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <Avatar name={highlight && amb ? 'Tú' : r.name} mask={mask} colorIdx={r.pos} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Person name={r.name} mask={mask} isMe={highlight && amb} />
                    {highlight && (
                      <span style={{ padding: '3px 8px', borderRadius: 999, background: T.blue, color: '#fff', fontSize: 11, fontWeight: 800 }}>Tú</span>
                    )}
                  </span>
                  {r.name ? (
                    <span style={{ fontSize: 12, color: T.muted }}>{[r.store, r.role].filter(Boolean).join(' · ') || '—'}</span>
                  ) : (
                    <span aria-hidden="true" style={{ fontSize: 12, color: T.muted, filter: 'blur(5px)', userSelect: 'none' }}>
                      Xxxxxx Xxxxx
                    </span>
                  )}
                </span>
              </span>
              <span role="cell">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: tono.bg, color: tono.fg, fontSize: 12, fontWeight: 700 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: lv.color }} />
                  {lv.name}
                </span>
              </span>
              <span role="cell" style={{ textAlign: 'right', fontSize: 16, fontWeight: 800 }}>
                {fmt(r.pts)}
              </span>
              <span role="cell" style={{ textAlign: 'right', fontSize: 12, fontWeight: 600, color: g.color }}>
                {g.text}
              </span>
            </div>
          )
        })}
      </div>

      {!amb && view === 'top' && total > 10 ? (
        <div style={{ padding: '16px 28px 22px', display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            style={{ ...btn, height: 42, padding: '0 20px', borderRadius: 999, border: '1px solid #E2E7EF', background: '#fff', color: T.ink, fontSize: 14, fontWeight: 700 }}
          >
            {showAll ? 'Ver solo el Top 10' : `Ver los ${total} participantes`}
          </button>
        </div>
      ) : (
        <div style={{ height: 16 }} />
      )}
    </section>
  )
}

/* ---------------- Premios del ciclo ---------------- */

export function PrizesCard({ me, rows, amb, premios }: { me: Fila | null; rows: Fila[]; amb: boolean; premios: PremioRk[] }) {
  const status = (p: PremioRk) => {
    if (!amb || !me) return { ok: true, text: 'Activo' }
    if (p.tipo === 'puntos' && p.minPts != null) {
      return me.pts >= p.minPts ? { ok: true, text: 'Desbloqueado' } : { ok: false, text: `Te faltan ${fmt(p.minPts - me.pts)}` }
    }
    const maxPos = p.maxPos ?? 0
    if (me.pos <= maxPos && me.pts > 0) return { ok: true, text: maxPos === 1 ? 'Vas ganando' : maxPos <= 3 ? 'En el podio' : '¡Vas dentro!' }
    const target = rows[maxPos - 1]
    return { ok: false, text: target ? `Te faltan ${fmt(target.pts - me.pts + 1)}` : 'Suma tu primer punto' }
  }
  const colores = (icon: string) =>
    icon === 'crown' || icon === 'star' ? { bg: '#FFF6DD', fg: '#B7791F' } : icon === 'medal' ? { bg: '#F0F2F6', fg: '#4D5A70' } : { bg: '#EEF3FD', fg: '#2453D6' }
  return (
    <section aria-labelledby="rk-prem" style={{ ...card, flex: '1 1 400px', minWidth: 0, padding: 28, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <h2 id="rk-prem" style={h2}>
        Premios del ciclo
      </h2>
      {premios.length === 0 && <span style={{ fontSize: 14, color: T.muted }}>Aún no hay premios definidos para este ciclo.</span>}
      {premios.map((p) => {
        const s = status(p)
        const c = colores(p.icon)
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ flex: 'none', width: 48, height: 48, borderRadius: 16, background: c.bg, color: c.fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={iconoValido(p.icon)} size={24} />
            </span>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{p.title}</span>
              <span style={{ fontSize: 13, color: T.muted }}>{p.prize}</span>
            </span>
            <span
              style={{
                flex: 'none', padding: '6px 10px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
                background: s.ok ? T.greenSoft : T.soft, color: s.ok ? T.greenText : T.muted,
              }}
            >
              <Icon name={s.ok ? 'check' : 'lock'} size={13} stroke={2.4} /> {s.text}
            </span>
          </div>
        )
      })}
    </section>
  )
}

/* ---------------- Camino de niveles ---------------- */

export function LevelPath({ pts, amb, niveles }: { pts: number; amb: boolean; niveles: NivelRk[] }) {
  const { nivel: lvl, siguiente: next, esMaximo, lista } = nivelDe(niveles, pts)
  const max = lista[lista.length - 1].min || 1
  return (
    <section aria-labelledby="rk-lvl" style={{ ...card, flex: '1 1 400px', minWidth: 0, padding: 28, display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 id="rk-lvl" style={h2}>
          Camino de niveles
        </h2>
        <span style={{ fontSize: 13, color: T.muted }}>
          {amb ? `Estás en ${lvl.name}${!esMaximo ? ` · ${fmt(next.min - pts)} pts para ${next.name}` : ' · nivel máximo'}` : 'Umbrales de puntos por ciclo'}
        </span>
      </div>
      <div style={{ position: 'relative', padding: '0 12px' }}>
        <div style={{ position: 'absolute', left: 30, right: 30, top: 21 }}>
          <Bar pct={amb ? (pts / max) * 100 : 100} color={T.blue} height={6} />
        </div>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, position: 'relative', display: 'flex', justifyContent: 'space-between' }}>
          {lista.map((l) => {
            const reached = !amb || pts >= l.min
            const cur = amb && l.id === lvl.id
            return (
              <li key={l.id} aria-current={cur ? 'step' : undefined} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 72 }}>
                <span
                  style={{
                    width: 48, height: 48, borderRadius: 24, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: reached ? l.color : '#fff', border: `3px solid ${cur ? T.navy : reached ? l.color : '#DDE3EC'}`, color: reached ? '#fff' : '#C3CAD6',
                  }}
                >
                  <Icon name={iconoValido(l.icon, 'star')} size={20} fill="currentColor" />
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: cur || !amb ? T.ink : T.muted, textAlign: 'center' }}>{l.name}</span>
                <span style={{ fontSize: 11, color: T.faint }}>{fmt(l.min)} pts</span>
              </li>
            )
          })}
        </ol>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 14, background: T.soft, fontSize: 13, color: T.body }}>
        <Icon name="gift" size={16} stroke={2} color={T.blue} />
        {amb
          ? esMaximo
            ? `Estás en ${lvl.name}${lvl.benefit ? `: ${lvl.benefit}` : ''}.`
            : `Al llegar a ${next.name} desbloqueas ${next.benefit || 'nuevos beneficios'}.`
          : lista.map((l) => `${l.name}: ${l.benefit || 'por definir'}`).join(' · ')}
      </div>
    </section>
  )
}

/* ---------------- Logros ---------------- */

const fondoDe = (color: string) => tonoNivel(color).bg

export function Badges({ list, amb, onOpen }: { list: LogroRk[]; amb: boolean; onOpen: (b: LogroRk) => void }) {
  if (list.length === 0) return null
  const done = list.filter((b) => b.unlocked).length
  return (
    <section aria-labelledby="rk-logros" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 id="rk-logros" style={h2}>
          {amb ? 'Tus logros' : 'Logros disponibles'}
        </h2>
        <span style={{ fontSize: 13, color: T.muted }}>
          {done} de {list.length} desbloqueados
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(190px, 100%), 1fr))', gap: 14 }}>
        {list.map((b) => {
          const ok = b.unlocked
          return (
            <button
              key={b.id}
              type="button"
              className="rk-badge"
              onClick={() => onOpen(b)}
              style={{ ...btn, flexDirection: 'column', gap: 10, padding: '20px 14px', borderRadius: 22, border: `1px solid ${T.line}`, background: '#fff', color: T.ink, textAlign: 'center' }}
            >
              <span
                style={{
                  position: 'relative', width: 64, height: 64, borderRadius: 32, background: ok ? fondoDe(b.color) : T.lineSoft, color: ok ? b.color : T.neutral,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Icon name={iconoValido(b.icon)} size={30} stroke={1.7} />
                {!ok && (
                  <span
                    style={{
                      position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, background: '#fff', border: '1px solid #E2E7EF',
                      color: T.faint, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Icon name="lock" size={12} stroke={2.4} />
                  </span>
                )}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{b.name}</span>
              <div style={{ width: '100%' }}>
                <Bar pct={ok ? 100 : (b.have / Math.max(1, b.need)) * 100} color={ok ? b.color : '#B8C3D6'} height={6} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: ok ? T.greenText : T.muted }}>
                {ok ? 'Desbloqueado' : b.need > 1 ? `${fmt(b.have)} / ${fmt(b.need)}` : 'Bloqueado'}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function BadgeModal({ badge, onClose }: { badge: LogroRk; onClose: () => void }) {
  const ok = badge.unlocked
  const confetti = ['#F2C94C', '#2453D6', '#22A06B', '#E04848', '#8E6CCF', '#F2C94C']
  return (
    <Modal label={`Logro: ${badge.name}`} onClose={onClose} maxWidth={400}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
        <CloseBtn onClick={onClose} style={{ position: 'absolute', top: 16, right: 16 }} />
        {ok && (
          <div aria-hidden="true" style={{ display: 'flex', gap: 12, height: 20 }}>
            {confetti.map((c, i) => (
              <span
                key={i}
                style={{ width: 8, height: 8, borderRadius: i % 2 ? 2 : 4, background: c, marginTop: (i % 3) * 5, animation: `rk-confetti 1.4s ${i * 0.08}s ease-out infinite` }}
              />
            ))}
          </div>
        )}
        <span
          style={{
            width: 104, height: 104, borderRadius: 52, background: ok ? fondoDe(badge.color) : T.lineSoft, color: ok ? badge.color : T.neutral,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name={iconoValido(badge.icon)} size={48} stroke={1.6} />
        </span>
        <h2 style={{ ...h2, fontSize: 22 }}>{badge.name}</h2>
        <span style={{ fontSize: 14, lineHeight: 1.55, color: T.muted }}>{badge.desc}</span>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          <Bar pct={ok ? 100 : (badge.have / Math.max(1, badge.need)) * 100} color={ok ? badge.color : '#B8C3D6'} />
          <span style={{ fontSize: 13, fontWeight: 700, color: ok ? T.greenText : T.muted }}>
            {ok ? '¡Logro desbloqueado!' : `Progreso: ${fmt(badge.have)} / ${fmt(badge.need)}`}
          </span>
        </div>
        {badge.reward && (
          <span style={{ padding: '6px 12px', borderRadius: 999, background: T.soft, fontSize: 12, fontWeight: 700, color: T.body }}>Recompensa: {badge.reward}</span>
        )}
      </div>
    </Modal>
  )
}

/* ---------------- Cómo ganar puntos (desde las reglas reales) ---------------- */

function describirRegla(r: ReglaRk): { sub: string; icon: 'bag' | 'link' | 'userPlus' | 'cap' | 'target' | 'star' | 'tag' } {
  const porCada = Number(r.condiciones?.por_cada ?? 0)
  switch (r.tipo) {
    case 'por_monto':
      return { sub: porCada > 0 ? `Por cada Q ${fmt(porCada)} vendidos (pago aprobado)` : 'Según el monto vendido', icon: 'bag' }
    case 'por_venta_fija':
      return { sub: 'Por cada venta con pago aprobado', icon: 'bag' }
    case 'por_categoria':
      return { sub: 'Ventas de categorías seleccionadas', icon: 'tag' }
    case 'por_margen':
      return { sub: 'Según el margen de la venta', icon: 'target' }
    case 'primera_venta_mes':
      return { sub: 'Tu primera venta del ciclo', icon: 'star' }
    case 'cliente_nuevo':
      return { sub: 'Primera compra de un cliente', icon: 'userPlus' }
    case 'curso_completado':
      return { sub: 'Al completar un curso de la Academia', icon: 'cap' }
    default:
      return { sub: '', icon: 'star' }
  }
}

export function HowModal({ reglas, onClose }: { reglas: ReglaRk[]; onClose: () => void }) {
  return (
    <Modal label="Cómo ganar puntos" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 style={{ ...h2, fontSize: 21 }}>¿Cómo gano puntos?</h2>
            <span style={{ fontSize: 14, color: T.muted }}>Cada acción suma a tu posición del ciclo. Los puntos solo se canjean por premios.</span>
          </div>
          <CloseBtn onClick={onClose} />
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {reglas.length === 0 && <li style={{ fontSize: 14, color: T.muted }}>Aún no hay reglas de puntos activas.</li>}
          {reglas.map((e) => {
            const d = describirRegla(e)
            return (
              <li key={e.title} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: `1px solid ${T.lineSoft}` }}>
                <span style={{ flex: 'none', width: 44, height: 44, borderRadius: 14, background: T.blueSoft, color: T.blue, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={d.icon} size={21} />
                </span>
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{e.title}</span>
                  {d.sub && <span style={{ fontSize: 13, color: T.muted }}>{d.sub}</span>}
                </span>
                <span style={{ fontSize: 14, fontWeight: 800, color: T.greenText }}>+{fmt(e.valor)} pts</span>
              </li>
            )
          })}
        </ul>
      </div>
    </Modal>
  )
}
