// Cloudflare Worker: pings the IceQ Sole API every 5 minutes so Render's free plan doesn't put it to
// sleep (a sleeping API makes the first visitor wait ~1 minute). /api/health doesn't touch the
// database, so Neon's free compute can still sleep. Deploy: cd ops/keepalive && npx wrangler@4 deploy
const TARGET = 'https://iceq-sole-api.onrender.com/api/health'

async function ping() {
  const t0 = Date.now()
  try {
    const r = await fetch(TARGET, { headers: { 'User-Agent': 'iceq-keepalive' }, cf: { cacheTtl: 0 } })
    return { ok: r.ok, status: r.status, ms: Date.now() - t0 }
  } catch (e) {
    return { ok: false, error: String(e), ms: Date.now() - t0 }
  }
}

export default {
  async scheduled(_event, _env, ctx) {
    ctx.waitUntil(ping())
  },
  async fetch() {
    return Response.json({ target: TARGET, ...(await ping()) })
  },
}
