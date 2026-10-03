// Room presence for Chordle versus mode.
// Each player POSTs its own state; the response is everyone in the room.
// State lives in one Redis hash per room (Upstash REST API, no npm dependencies).
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ROOM_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
const PEER_RE = /^[a-z0-9]{8,32}$/;
const STALE_MS = 75000;       // background tabs can be throttled to one timer a minute; closing a tab leaves at once via sendBeacon
const ROOM_TTL_S = 2 * 3600;  // empty rooms disappear after two hours

async function redis(cmds) {
  const r = await fetch(URL_ + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return (await r.json()).map(x => x.result);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_ || !TOKEN) return res.status(503).json({ error: 'not_configured' });
  if (req.method === 'GET' && req.query && req.query.ping !== undefined) return res.json({ ok: true });
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const { room, peer, presence, leave } = body || {};
  if (!ROOM_RE.test(String(room)) || !PEER_RE.test(String(peer))) return res.status(400).json({ error: 'bad_request' });
  const key = 'chordle:room:' + room;

  try {
    if (leave) { await redis([['HDEL', key, peer]]); return res.json({ peers: [] }); }
    const cmds = [];
    if (presence && typeof presence === 'object') {
      const text = JSON.stringify({ p: presence, t: Date.now() });
      if (text.length > 4096) return res.status(413).json({ error: 'too_large' });
      cmds.push(['HSET', key, peer, text], ['EXPIRE', key, ROOM_TTL_S]);
    }
    cmds.push(['HGETALL', key]);
    const out = await redis(cmds);
    const flat = out[out.length - 1] || [];
    const now = Date.now(), peers = [], stale = [];
    for (let i = 0; i < flat.length; i += 2) {
      let v; try { v = JSON.parse(flat[i + 1]); } catch (e) { continue; }
      if (now - v.t > STALE_MS) stale.push(flat[i]);
      else peers.push({ peer: flat[i], presence: v.p, at: v.t });
    }
    if (stale.length) redis([['HDEL', key, ...stale]]).catch(() => {});
    res.json({ peers });
  } catch (e) {
    res.status(502).json({ error: 'upstream' });
  }
};
