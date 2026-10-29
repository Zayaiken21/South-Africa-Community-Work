import {getDb} from '../../../db';
import {jobs} from '../../../db/schema';
import {gt} from 'drizzle-orm';
import {distanceKm, eligible, validLocation, validateJob} from '../../../lib/jobs';
const cors = {
  'Access-Control-Allow-Origin': 'https://zayaiken21.github.io',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  Vary: 'Origin',
};
function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {...init, headers: {...cors, ...init.headers}});
}
export function OPTIONS() {
  return new Response(null, {status: 204, headers: cors});
}
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams;
    const lat = p.has('lat') ? Number(p.get('lat')) : NaN,
      lon = p.has('lon') ? Number(p.get('lon')) : NaN;
    const radius = Number(p.get('radius') || 25),
      minPay = Number(p.get('minPay') || 0);
    if (!validLocation(lat, lon)) return json({error: 'Set your location to see jobs in your radius.'}, {status: 400});
    if (!Number.isFinite(radius) || radius < 1 || radius > 200 || !Number.isFinite(minPay) || minPay < 0)
      return json({error: 'Invalid filters.'}, {status: 400});
    const all = await getDb().select().from(jobs).where(gt(jobs.start, new Date().toISOString()));
    const q = (p.get('q') || '').toLowerCase(),
      category = p.get('category');
    let results = all
      .map(j => ({
        ...j,
        distance: distanceKm(lat, lon, j.latitude, j.longitude),
        hourly: j.payType === 'hour' ? j.pay : j.pay / j.hours,
      }))
      .filter(
        j =>
          (!p.get('id') || j.id === p.get('id')) &&
          eligible(j.distance, radius, j.radius) &&
          j.hourly >= minPay &&
          (!category || j.category === category) &&
          `${j.title} ${j.description} ${j.business} ${j.city}`.toLowerCase().includes(q),
      );
    const sort = p.get('sort');
    results.sort((a, b) =>
      sort === 'pay'
        ? b.hourly - a.hourly || a.distance - b.distance
        : sort === 'newest'
          ? b.createdAt - a.createdAt
          : a.distance - b.distance,
    );
    return json({jobs: results}, {headers: {'Cache-Control': 'no-store'}});
  } catch {
    return json({error: 'Jobs could not be loaded. Please try again.'}, {status: 500});
  }
}
export async function POST(request: Request) {
  try {
    if (
      request.headers.get('origin') &&
      ![new URL(request.url).origin, 'https://zayaiken21.github.io'].includes(request.headers.get('origin')!)
    )
      return json({error: 'Invalid request origin.'}, {status: 403});
    const text = await request.text();
    if (text.length > 12000) return json({error: 'Listing is too large.'}, {status: 413});
    let value;
    try {
      value = validateJob(JSON.parse(text));
    } catch (e) {
      return json({error: e instanceof Error ? e.message : 'Invalid listing.'}, {status: 400});
    }
    const job = {...value, id: crypto.randomUUID(), createdAt: Date.now()};
    await getDb()
      .insert(jobs)
      .values(job as typeof jobs.$inferInsert);
    return json({id: job.id}, {status: 201});
  } catch {
    return json({error: 'Your job was not saved. Please try again.'}, {status: 500});
  }
}
