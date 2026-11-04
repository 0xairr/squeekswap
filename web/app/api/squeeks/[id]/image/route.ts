import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { bad, overLimit } from '@/lib/api'
import { genesisArtwork } from '@/lib/genesis-art'
import { ART_VERSION } from '@/lib/reads'
import { cachedSqueek } from '@/lib/squeek-api-cache'

// Genesis art (read onchain from tokenURI) is a ~56 KB SVG with over a thousand <use> elements. Painting that vector in every card made
// scrolling and selection janky, so cards get a small WebP rendered once here and cached. `?full=1` returns
// the original SVG.
const THUMB_PX = 384
const MAX_THUMBS = 3_000
type Thumbs = Map<string, Promise<Buffer>>
const shared = globalThis as typeof globalThis & { __squeekThumbs?: Thumbs }
const thumbs: Thumbs = shared.__squeekThumbs ??= new Map()

// Each uncached render costs ~200 ms of CPU. Rendering is capped so a script requesting every token cannot pin
// the server: a few renders run at once, a short queue waits, and anything beyond that is told the server is busy.
const RENDER_SLOTS = 4
const MAX_WAITING = 64
let rendering = 0
const waiting: Array<() => void> = []
class RenderBusy extends Error {}

async function withRenderSlot<T>(work: () => Promise<T>): Promise<T> {
  if (rendering >= RENDER_SLOTS) {
    if (waiting.length >= MAX_WAITING) throw new RenderBusy('Artwork renderer is busy.')
    await new Promise<void>((resolve) => waiting.push(resolve))
  }
  rendering++
  try {
    return await work()
  } finally {
    rendering--
    waiting.shift()?.()
  }
}

function thumbnail(svg: Buffer): Promise<Buffer> {
  const key = createHash('sha1').update(svg).digest('hex')
  let thumb = thumbs.get(key)
  if (!thumb) {
    if (thumbs.size >= MAX_THUMBS) thumbs.delete(thumbs.keys().next().value!)
    // Render near 2x the thumbnail size (the SVG is 1568 px at 72 dpi), then downscale for crisp dots.
    thumb = withRenderSlot(() => sharp(svg, { density: 48 }).resize(THUMB_PX, THUMB_PX).webp({ quality: 80 }).toBuffer())
    thumb.catch(() => thumbs.delete(key))
    thumbs.set(key, thumb)
  }
  return thumb
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = overLimit(request, 'image')
  if (limited) return limited
  const { id } = await params
  if (!/^\d{1,4}$/.test(id) || Number(id) < 1 || Number(id) > 9999) return bad('Use a Genesis token ID from 1 to 9999.')
  // Accept only the query the site generates (genesisImagePath): any other variant would miss the CDN cache.
  const query = new URL(request.url).searchParams
  const allowed = [...query.keys()].every((key) => key === 'v' || key === 'l' || key === 'full')
  const level = query.get('l')
  if (!allowed || (query.has('v') && query.get('v') !== ART_VERSION) || (level !== null && !/^(10|[1-9])$/.test(level)) || (query.has('full') && query.get('full') !== '1')) {
    return bad('Unsupported artwork parameters.')
  }
  try {
    // Onchain tokenURI first (works from any host); the Squeekchain API is only a fallback.
    const image = await genesisArtwork(id).catch(() => null) ?? (await cachedSqueek(id).catch(() => null))?.metadata?.imageDataUri
    if (!image) return bad('Artwork is unavailable for this Squeek.', 404)
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(image)
    if (!match) return bad('Artwork encoding is unsupported.', 502)
    const original = Buffer.from(match[2], 'base64')
    const full = new URL(request.url).searchParams.get('full') === '1'
    const svg = match[1] === 'image/svg+xml'
    let body: Buffer = original
    let type = match[1]
    if (svg && !full) {
      try {
        body = await thumbnail(original)
        type = 'image/webp'
      } catch {
        // Busy or failed: serve the original artwork rather than a broken image, but do not let caches keep
        // it, so the next view gets the light thumbnail.
      }
    }
    const fallback = svg && !full && type !== 'image/webp'
    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': type,
        'Cache-Control': fallback ? 'no-store' : 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return bad('Could not load this artwork right now.', 502)
  }
}
