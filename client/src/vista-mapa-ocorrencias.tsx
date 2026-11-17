import { memo, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { rotuloSeveridade } from './cartao-ocorrencia';
import type { Ocorrencia } from './api';

const CENTRO_MAPUTO: L.LatLngExpression = [-25.96, 32.58];

const ROTULO_ESTADO: Record<Ocorrencia['status'], string> = {
  TRIADA: 'Triada',
  ENCAMINHADA: 'Encaminhada',
  VALIDADA: 'Validada',
};

const ICONE = L.divIcon({
  className: 'mapa-marcador',
  html: '<span class="mapa-marcador-ponto"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -8],
});

export const VistaMapaOcorrencias = memo(function VistaMapaOcorrencias({
  ocorrencias,
}: {
  ocorrencias: Ocorrencia[];
}) {
  const contentorRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const camadaRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const el = contentorRef.current;
    if (!el || mapaRef.current) return;

    const mapa = L.map(el, {
      center: CENTRO_MAPUTO,
      zoom: 11,
      scrollWheelZoom: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
    }).addTo(mapa);
    camadaRef.current = L.layerGroup().addTo(mapa);
    mapaRef.current = mapa;

    const redimensionar = () => mapa.invalidateSize();
    const temporizador = window.setTimeout(redimensionar, 80);
    window.addEventListener('resize', redimensionar);

    return () => {
      window.clearTimeout(temporizador);
      window.removeEventListener('resize', redimensionar);
      mapa.remove();
      mapaRef.current = null;
      camadaRef.current = null;
    };
  }, []);

  useEffect(() => {
    const mapa = mapaRef.current;
    const camada = camadaRef.current;
    if (!mapa || !camada) return;

    camada.clearLayers();
    const pontos: L.LatLngExpression[] = [];

    for (const item of ocorrencias) {
      if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) continue;
      const pos: L.LatLngExpression = [item.latitude, item.longitude];
      pontos.push(pos);
      const severidade =
        item.severidade === null || item.severidade === undefined
          ? '—'
          : `${rotuloSeveridade(item.severidade)} (${item.severidade}/5)`;
      const popup = [
        `<strong>${escaparHtml(item.cultura)}</strong>`,
        `<span>${ROTULO_ESTADO[item.status]}</span>`,
        item.parcelaNome ? `<span>${escaparHtml(item.parcelaNome)}</span>` : '',
        `<span>Severidade: ${escaparHtml(severidade)}</span>`,
      ]
        .filter(Boolean)
        .join('<br/>');
      L.marker(pos, { icon: ICONE }).bindPopup(popup).addTo(camada);
    }

    if (pontos.length === 0) {
      mapa.setView(CENTRO_MAPUTO, 11);
    } else if (pontos.length === 1) {
      mapa.setView(pontos[0], 13);
    } else {
      mapa.fitBounds(L.latLngBounds(pontos), { padding: [28, 28], maxZoom: 14 });
    }
    window.setTimeout(() => mapa.invalidateSize(), 40);
  }, [ocorrencias]);

  return (
    <div className="mapa-envolvente" role="region" aria-label="Mapa das ocorrências">
      <div ref={contentorRef} className="mapa-leaflet" />
      {ocorrencias.length === 0 ? (
        <p className="mapa-vazio nota">Sem ocorrências para localizar no mapa.</p>
      ) : null}
    </div>
  );
});

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
