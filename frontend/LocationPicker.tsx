import {useRef, useState} from 'react';
import {LocateFixed, LoaderCircle, Search, MapPin, ArrowRight} from 'lucide-react';
import {validLocation} from '../lib/jobs';
import {cities, type Location} from './catalog';
import {locateWithGps} from './location';

const cache = new Map<string, Location[]>();

const gpsMessages = {
  outside: 'Your device is outside South Africa. Choose a South African city below or search for an address.',
  denied: 'Location is blocked for this site. Allow it in your browser or phone settings, or choose your area below.',
  unavailable: 'We couldn’t get a GPS fix. Choose your area below or search for it.',
};

export function LocationPicker({onSelect, purpose = 'browse'}: {onSelect: (l: Location) => void; purpose?: 'browse' | 'post'}) {
  const [busy, setBusy] = useState<'' | 'gps' | 'search'>('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Location[]>([]);
  const [searched, setSearched] = useState(false);
  const last = useRef(0);

  async function gps() {
    setBusy('gps'); setError('');
    const r = await locateWithGps();
    setBusy('');
    if (r.location) onSelect(r.location);
    else setError(gpsMessages[r.reason || 'unavailable']);
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const text = query.trim();
    if (text.length < 2 || busy || Date.now() - last.current < 1100) return;
    last.current = Date.now();
    setError(''); setSearched(false); setResults([]); setBusy('search');
    try {
      const key = text.toLowerCase();
      let places = cache.get(key);
      if (!places) {
        const params = new URLSearchParams({q: text, limit: '8', lang: 'en', bbox: '16,-35,33,-22'});
        const r = await fetch('https://photon.komoot.io/api/?' + params, {signal: AbortSignal.timeout(12000)});
        if (!r.ok) throw Error('Search is busy right now. Pick a city below instead.');
        const d: any = await r.json();
        places = (d.features || [])
          .filter((f: any) => f.properties?.countrycode?.toUpperCase() === 'ZA' && validLocation(f.geometry?.coordinates?.[1], f.geometry?.coordinates?.[0]))
          .map((f: any) => {
            const p = f.properties;
            const label = [...new Set([p.name, [p.housenumber, p.street].filter(Boolean).join(' '), p.district, p.city, p.state].filter(Boolean))].join(', ');
            return {lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], label, source: 'search' as const};
          });
        cache.set(key, places!);
      }
      setResults(places!); setSearched(true);
    } catch (e) {
      setError(e instanceof Error && e.name === 'TimeoutError' ? 'Search took too long. Pick a city below instead.' : e instanceof Error ? e.message : 'Search failed. Pick a city below.');
    } finally { setBusy(''); }
  }

  return (
    <div className="picker">
      <button type="button" className="btn btn-primary btn-block" disabled={!!busy} onClick={gps}>
        {busy === 'gps' ? <LoaderCircle className="spin" size={18}/> : <LocateFixed size={18}/>}
        {purpose === 'post' ? 'Use my location (I’m at the workplace)' : 'Use my current location'}
      </button>
      {error && <p className="alert" role="alert">{error}</p>}

      <form className="search-box" onSubmit={search}>
        <Search size={18}/>
        <input value={query} onChange={e => { setQuery(e.target.value); setResults([]); setSearched(false); }}
          placeholder={purpose === 'post' ? 'Workplace street address or suburb' : 'Search suburb, town or address'}
          aria-label="Search for a place in South Africa" minLength={2} maxLength={200} autoComplete="off" enterKeyHint="search"/>
        <button className="btn btn-dark btn-sm" disabled={!!busy || query.trim().length < 2}>
          {busy === 'search' ? <LoaderCircle className="spin" size={16}/> : 'Search'}
        </button>
      </form>

      {searched && !results.length && <p className="hint-box" role="status">No matching places. Try a nearby suburb, add the province, or pick a city below.</p>}
      {results.length > 0 && (
        <div className="place-list">
          {results.map((p, i) => (
            <button type="button" key={p.label + i} onClick={() => onSelect(p)}>
              <MapPin size={17}/><span>{p.label}</span><ArrowRight size={16}/>
            </button>
          ))}
        </div>
      )}

      {purpose === 'browse' && (
        <>
          <p className="overline">Or tap a city</p>
          <div className="city-chips">
            {cities.map(c => <button type="button" key={c.label} onClick={() => onSelect(c)}>{c.label.split(',')[0]}</button>)}
          </div>
        </>
      )}
      <small className="fineprint">
        {purpose === 'post' ? 'Search the workplace address so nearby workers see the right distance.' : 'Your area is saved on this device only.'}
        {' '}Place search by Photon · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
      </small>
    </div>
  );
}
