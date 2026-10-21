'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'

// Ícono propio: los PNG por defecto de Leaflet no se resuelven con el
// bundler, así que el pin se dibuja como SVG inline.
const iconoPin = L.divIcon({
  className: '',
  html: `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg"><path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.3 21.7 0 14 0z" fill="#b8860b"/><circle cx="14" cy="14" r="5.5" fill="#fff"/></svg>`,
  iconSize: [28, 40],
  iconAnchor: [14, 40],
})

export type Coordenada = { lat: number; lng: number }

function Recentrar({ punto }: { punto: Coordenada }) {
  const mapa = useMap()
  useEffect(() => {
    mapa.setView([punto.lat, punto.lng], Math.max(mapa.getZoom(), 15))
  }, [mapa, punto.lat, punto.lng])
  return null
}

function ClickParaMover({ onCambio }: { onCambio: (c: Coordenada) => void }) {
  useMapEvents({
    click(e) {
      onCambio({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

export default function MapaUbicacionLeaflet({
  punto,
  onCambio,
  soloLectura,
  alto = 280,
}: {
  punto: Coordenada | null
  onCambio?: (c: Coordenada) => void
  soloLectura?: boolean
  alto?: number
}) {
  // Centro por defecto: Ciudad de Guatemala.
  const centro = useMemo<Coordenada>(() => punto ?? { lat: 14.6349, lng: -90.5069 }, [punto])

  return (
    <div style={{ height: alto }} className="overflow-hidden rounded-lg border border-border">
      <MapContainer
        center={[centro.lat, centro.lng]}
        zoom={punto ? 15 : 12}
        scrollWheelZoom={!soloLectura}
        dragging
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {punto && (
          <Marker
            position={[punto.lat, punto.lng]}
            icon={iconoPin}
            draggable={!soloLectura}
            eventHandlers={
              soloLectura || !onCambio
                ? undefined
                : {
                    dragend(e) {
                      const p = (e.target as L.Marker).getLatLng()
                      onCambio({ lat: p.lat, lng: p.lng })
                    },
                  }
            }
          />
        )}
        {punto && <Recentrar punto={punto} />}
        {!soloLectura && onCambio && <ClickParaMover onCambio={onCambio} />}
      </MapContainer>
    </div>
  )
}
