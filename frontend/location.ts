/*
  Works out the visitor's area: GPS first (fast, low accuracy), then an estimate from the internet connection
  (GeoJS, then ipapi) if GPS is blocked, slow or outside South Africa.
*/
import {validLocation} from '../lib/jobs';
import type {Location} from './catalog';

/** The result of finding the visitor's area. */
export type LocateResult = {location?: Location; reason?: 'outside' | 'denied' | 'unavailable'};

/** Asks the device for its position (low accuracy, fast). */
function gpsPosition(timeout = 12000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('unavailable'));
    // Low accuracy first: it answers fast indoors and on desktops (Wi-Fi/cell based). Area-level is enough for a job radius.
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout,
      maximumAge: 10 * 60 * 1000,
    });
  });
}

/** Whether location is allowed, blocked or not asked yet. */
async function permissionState(): Promise<PermissionState | 'unknown'> {
  try {
    return (await navigator.permissions.query({name: 'geolocation'})).state;
  } catch {
    return 'unknown';
  }
}

// Turn coordinates into "Sandton, Johannesburg" instead of a generic label. Optional: falls back silently.
export async function placeName(lat: number, lon: number): Promise<string | null> {
  try {
    const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&lang=en`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const p = ((await r.json()) as any).features?.[0]?.properties;
    if (!p) return null;
    const parts = [p.district || p.locality || p.name, p.city || p.county, p.state].filter(Boolean);
    return [...new Set(parts)].slice(0, 2).join(', ') || null;
  } catch {
    return null;
  }
}

// Approximate area from the network connection. Used only when GPS is blocked, slow or outside South Africa.
async function networkArea(): Promise<Location | null> {
  const sources = [
    async () => {
      const d: any = await (
        await fetch('https://get.geojs.io/v1/ip/geo.json', {signal: AbortSignal.timeout(6000)})
      ).json();
      return {cc: d.country_code, lat: Number(d.latitude), lon: Number(d.longitude), city: d.city, region: d.region};
    },
    async () => {
      const d: any = await (await fetch('https://ipapi.co/json/', {signal: AbortSignal.timeout(6000)})).json();
      return {cc: d.country_code, lat: Number(d.latitude), lon: Number(d.longitude), city: d.city, region: d.region};
    },
  ];
  for (const source of sources) {
    try {
      const d = await source();
      if (String(d.cc).toUpperCase() !== 'ZA' || !validLocation(d.lat, d.lon)) return null;
      return {
        lat: d.lat,
        lon: d.lon,
        label: [d.city, d.region].filter(Boolean).join(', ') || 'Your area',
        approx: true,
        source: 'ip',
      };
    } catch {
      /* try next */
    }
  }
  return null;
}

/** GPS position as a place label. */
export async function locateWithGps(): Promise<LocateResult> {
  try {
    const p = await gpsPosition(15000);
    const {latitude: lat, longitude: lon} = p.coords;
    if (!validLocation(lat, lon)) return {reason: 'outside'};
    return {location: {lat, lon, label: (await placeName(lat, lon)) || 'My current location', source: 'gps'}};
  } catch (e) {
    const code = (e as GeolocationPositionError)?.code;
    return {reason: code === 1 ? 'denied' : 'unavailable'};
  }
}

// Runs on its own when someone opens the app without a saved area.
export async function autoLocate(): Promise<LocateResult> {
  const state = await permissionState();
  let gps: LocateResult = {reason: state === 'denied' ? 'denied' : 'unavailable'};
  if (state !== 'denied') gps = await locateWithGps();
  if (gps.location) return gps;
  const area = await networkArea();
  if (area) return {location: area};
  return gps;
}
