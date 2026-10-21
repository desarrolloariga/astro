'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { LocateFixed, MapPin, Navigation } from 'lucide-react'
import type { Coordenada } from './mapa-ubicacion-leaflet'

// Leaflet usa window/document: solo se carga en el navegador.
const MapaLeaflet = dynamic(() => import('./mapa-ubicacion-leaflet'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[280px] items-center justify-center rounded-lg border border-border bg-secondary/40 text-xs text-muted-foreground">
      Cargando mapa…
    </div>
  ),
})

/** Selector de ubicación para checkout: pin arrastrable o clic en el mapa; escribe latitud/longitud en inputs ocultos. */
export function MapaUbicacion({ nombreLat = 'latitud', nombreLng = 'longitud' }: { nombreLat?: string; nombreLng?: string }) {
  const [punto, setPunto] = useState<Coordenada | null>(null)
  const [aviso, setAviso] = useState('')

  function usarMiUbicacion() {
    setAviso('')
    if (!navigator.geolocation) {
      setAviso('Tu navegador no permite obtener la ubicación — marca el punto en el mapa.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setPunto({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setAviso('No se pudo obtener tu ubicación — marca el punto en el mapa.'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <MapPin className="h-4 w-4 text-primary" />
          Ubicación de entrega en el mapa
        </span>
        <button
          type="button"
          onClick={usarMiUbicacion}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
        >
          <LocateFixed className="h-3.5 w-3.5" />
          Usar mi ubicación
        </button>
      </div>
      <MapaLeaflet punto={punto} onCambio={setPunto} />
      <p className="text-xs text-muted-foreground">
        {punto
          ? `Punto marcado: ${punto.lat.toFixed(5)}, ${punto.lng.toFixed(5)} — arrastra el pin para ajustarlo.`
          : 'Toca el mapa para marcar el punto exacto de entrega (opcional, pero ayuda mucho a logística).'}
      </p>
      {aviso && <p className="text-xs text-destructive">{aviso}</p>}
      <input type="hidden" name={nombreLat} value={punto ? punto.lat.toFixed(6) : ''} />
      <input type="hidden" name={nombreLng} value={punto ? punto.lng.toFixed(6) : ''} />
    </div>
  )
}

/** Mapa solo lectura + accesos directos a Google Maps / Waze. */
export function MapaUbicacionLectura({ latitud, longitud }: { latitud: number | null; longitud: number | null }) {
  if (latitud == null || longitud == null) {
    return <p className="text-xs text-muted-foreground">No se marcó un punto en el mapa.</p>
  }
  return (
    <div className="flex flex-col gap-2">
      <MapaLeaflet punto={{ lat: Number(latitud), lng: Number(longitud) }} soloLectura alto={240} />
      <div className="flex flex-wrap gap-2">
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${latitud},${longitud}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
        >
          <MapPin className="h-3.5 w-3.5" />
          Abrir en Google Maps
        </a>
        <a
          href={`https://waze.com/ul?ll=${latitud},${longitud}&navigate=yes`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
        >
          <Navigation className="h-3.5 w-3.5" />
          Abrir en Waze
        </a>
      </div>
    </div>
  )
}
