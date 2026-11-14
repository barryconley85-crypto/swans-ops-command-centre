import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Point = { lat: number; lng: number };
type SearchResult = { lat: string; lon: string; display_name: string };

declare global {
  interface Window { L?: any }
}

let leafletLoader: Promise<any> | null = null;
let lastPlaceSearchAt = 0;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletLoader) {
    leafletLoader = new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-leaflet-style]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        link.dataset.leafletStyle = "true";
        document.head.appendChild(link);
      }
      const existing = document.querySelector<HTMLScriptElement>('script[data-leaflet-script]');
      if (existing) {
        existing.addEventListener("load", () => resolve(window.L), { once: true });
        existing.addEventListener("error", () => reject(new Error("Map library could not be loaded.")), { once: true });
        if (window.L) resolve(window.L);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.async = true;
      script.dataset.leafletScript = "true";
      script.onload = () => window.L ? resolve(window.L) : reject(new Error("Map library did not start."));
      script.onerror = () => reject(new Error("Map library could not be loaded."));
      document.body.appendChild(script);
    }).catch(error => {
      leafletLoader = null;
      throw error;
    });
  }
  return leafletLoader;
}

export default function DepotGeofenceMap({
  initialCenter,
  initialRadius,
  saving,
  onCancel,
  onSave,
}: {
  initialCenter: Point | null;
  initialRadius: number;
  saving: boolean;
  onCancel: () => void;
  onSave: (center: Point, radiusMetres: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const [center, setCenter] = useState<Point | null>(initialCenter);
  const [radius, setRadius] = useState(initialRadius);
  const [place, setPlace] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    let disposed = false;
    loadLeaflet().then(L => {
      if (disposed || !hostRef.current) return;
      const start = initialCenter || { lat: 52.5, lng: -2.0 };
      const map = L.map(hostRef.current, { scrollWheelZoom: true }).setView([start.lat, start.lng], initialCenter ? 16 : 6);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).addTo(map);
      mapRef.current = map;
      const icon = L.divIcon({
        className: "",
        html: '<div style="width:22px;height:22px;border:3px solid white;border-radius:50% 50% 50% 0;background:#167E8A;transform:rotate(-45deg);box-shadow:0 1px 5px #345"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 20],
      });
      const draw = (point: Point) => {
        setCenter(point);
        if (!markerRef.current) markerRef.current = L.marker([point.lat, point.lng], { icon, draggable: true }).addTo(map);
        else markerRef.current.setLatLng([point.lat, point.lng]);
        markerRef.current.off("dragend");
        markerRef.current.on("dragend", (event: any) => {
          const p = event.target.getLatLng();
          setCenter({ lat: p.lat, lng: p.lng });
          circleRef.current?.setLatLng([p.lat, p.lng]);
        });
        if (!circleRef.current) circleRef.current = L.circle([point.lat, point.lng], { radius, color: "#167E8A", fillColor: "#35C9C3", fillOpacity: 0.2, weight: 2 }).addTo(map);
        else circleRef.current.setLatLng([point.lat, point.lng]);
      };
      if (initialCenter) draw(initialCenter);
      map.on("click", (event: any) => draw({ lat: event.latlng.lat, lng: event.latlng.lng }));
      window.setTimeout(() => map.invalidateSize(), 0);
    }).catch(error => {
      if (!disposed) setMapError(error instanceof Error ? error.message : "Map could not be loaded.");
    });
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (circleRef.current) circleRef.current.setRadius(radius);
  }, [radius]);

  const searchPlace = async () => {
    const query = place.trim();
    if (!query || searching) return;
    setSearching(true);
    setResults([]);
    try {
      const waitMs = Math.max(0, 1100 - (Date.now() - lastPlaceSearchAt));
      if (waitMs) await new Promise(resolve => window.setTimeout(resolve, waitMs));
      lastPlaceSearchAt = Date.now();
      const response = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=" + encodeURIComponent(query), {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Place search is temporarily unavailable.");
      const matches = await response.json() as SearchResult[];
      setResults(matches);
      if (!matches.length) setMapError("No matching places found. Try a postcode or address.");
      else setMapError("");
    } catch (error) {
      setMapError(error instanceof Error ? error.message : "Place search is temporarily unavailable.");
    } finally {
      setSearching(false);
    }
  };

  const chooseResult = (result: SearchResult) => {
    const point = { lat: Number(result.lat), lng: Number(result.lon) };
    setCenter(point);
    setResults([]);
    if (mapRef.current) {
      mapRef.current.setView([point.lat, point.lng], 17);
      const L = window.L;
      const icon = L.divIcon({
        className: "",
        html: '<div style="width:22px;height:22px;border:3px solid white;border-radius:50% 50% 50% 0;background:#167E8A;transform:rotate(-45deg);box-shadow:0 1px 5px #345"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 20],
      });
      if (!markerRef.current) markerRef.current = L.marker([point.lat, point.lng], { icon, draggable: true }).addTo(mapRef.current);
      else markerRef.current.setLatLng([point.lat, point.lng]);
      markerRef.current.off("dragend");
      markerRef.current.on("dragend", (event: any) => {
        const p = event.target.getLatLng();
        setCenter({ lat: p.lat, lng: p.lng });
        circleRef.current?.setLatLng([p.lat, p.lng]);
      });
      if (!circleRef.current) circleRef.current = L.circle([point.lat, point.lng], { radius, color: "#167E8A", fillColor: "#35C9C3", fillOpacity: 0.2, weight: 2 }).addTo(mapRef.current);
      else circleRef.current.setLatLng([point.lat, point.lng]);
    }
    setMapError("");
  };

  return <div className="rounded-lg border border-[#DCE7EF] bg-white p-2">
    <Label htmlFor="geofence-place-search">Find depot by name or postcode</Label>
    <div className="mt-1 flex gap-1">
      <Input id="geofence-place-search" value={place} onChange={event => setPlace(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void searchPlace(); } }} placeholder="Search a depot or postcode" className="min-w-0" />
      <Button type="button" size="sm" variant="outline" disabled={searching || !place.trim()} onClick={() => void searchPlace()}>{searching ? "Searching…" : "Search"}</Button>
    </div>
    {results.length ? <div className="mt-2 max-h-32 space-y-1 overflow-auto">{results.map((result, index) => <button key={result.lat + result.lon + index} type="button" className="block w-full rounded px-2 py-1 text-left text-[11px] text-[#29485E] hover:bg-[#EEF5F9]" onClick={() => chooseResult(result)}>{result.display_name}</button>)}</div> : null}
    <div ref={hostRef} role="application" aria-label="Choose depot location on the map" className="mt-2 h-64 overflow-hidden rounded-md bg-[#E8EFF4]" />
    <p className="mt-2 text-[10px] leading-4 text-[#71879A]">Click the map or drag the pin to set the centre. The circle shows the allowed area. You can also search by depot name or postcode.</p>
    <div className="mt-2">
      <div className="flex items-center justify-between"><Label htmlFor="geofence-radius-map">Allowed radius</Label><span className="text-xs font-semibold text-[#29485E]">{radius} metres</span></div>
      <input id="geofence-radius-map" aria-label="Allowed radius in metres" type="range" min={30} max={500} step={10} value={radius} onChange={event => setRadius(Number(event.target.value))} className="mt-2 w-full accent-[#167E8A]" />
    </div>
    {mapError ? <p role="alert" className="mt-2 text-[11px] text-[#A84237]">{mapError}</p> : null}
    <div className="mt-3 flex gap-2"><Button type="button" size="sm" variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button><Button type="button" size="sm" className="flex-1" disabled={!center || saving} onClick={() => center && onSave(center, radius)}>{saving ? "Saving…" : "Save geofence"}</Button></div>
  </div>;
}
