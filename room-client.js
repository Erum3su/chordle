// Stand-in for the claude.ai `room` capability, backed by /api/room.
// Each tab checks in about once a second with its own state and receives everyone else's.
(() => {
  if (window.claude && window.claude.use) return;
  const me = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => (b % 36).toString(36)).join('');
  const POLL_MS = 1200, BEAT_MS = 4000;

  function joinRoom(name) {
    // One request at a time: `ver` counts local presence changes, `sentVer` the last one the server has.
    let mine = {}, ver = 1, sentVer = 0, lastSent = 0, alive = true, busy = false, timer = null, cache = [], last = '';
    const subs = new Set();
    const toPeer = p => Object.freeze({
      peer: p.peer, by: null, isMe: p.peer === me, sameTab: p.peer === me, kind: 'viewer', guest: false,
      presence: Object.freeze(p.peer === me ? { ...mine } : (p.presence || {})), updatedAt: p.at || Date.now(),
    });
    const schedule = ms => { clearTimeout(timer); if (alive) timer = setTimeout(tick, ms); };
    async function tick() {
      if (!alive || busy) return;
      busy = true;
      const v = ver, send = v !== sentVer || Date.now() - lastSent > BEAT_MS;
      try {
        const r = await fetch('/api/room', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(send ? { room: name, peer: me, presence: mine } : { room: name, peer: me }),
        });
        if (r.ok) {
          if (send) { sentVer = v; lastSent = Date.now(); }
          const { peers } = await r.json();
          const list = peers.filter(p => p.peer !== me).concat([{ peer: me }]);
          const sig = JSON.stringify(list.map(p => [p.peer, p.presence])) + JSON.stringify(mine);
          if (sig !== last) {
            last = sig; cache = Object.freeze(list.map(toPeer));
            subs.forEach(f => { try { f({ peers: cache, joined: [], left: [], updated: [] }); } catch (e) {} });
          }
        }
      } catch (e) {}
      busy = false;
      schedule(ver !== sentVer ? 60 : POLL_MS);
    }
    const leaveBeacon = () => { try { navigator.sendBeacon('/api/room', new Blob([JSON.stringify({ room: name, peer: me, leave: true })], { type: 'application/json' })); } catch (e) {} };
    window.addEventListener('pagehide', leaveBeacon);
    schedule(0);
    return {
      name,
      presence(patch) {
        for (const k in patch) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; }
        ver++; if (!busy) schedule(60);
        return Promise.resolve();
      },
      peers() { return cache; },
      onPeers(f) { subs.add(f); setTimeout(() => f({ peers: cache, joined: cache, left: [], updated: [] })); return () => subs.delete(f); },
      emit() { return Promise.resolve(); }, on() { return () => {}; },
      connected() { return alive; }, onConnection(f) { setTimeout(() => f(alive)); return () => {}; },
      leave() { alive = false; clearTimeout(timer); window.removeEventListener('pagehide', leaveBeacon); leaveBeacon(); return Promise.resolve(); },
    };
  }

  const ready = fetch('/api/room?ping').then(r => r.ok).catch(() => false);
  window.claude = {
    use: async name => {
      if (name !== 'room') return null;
      if (!(await ready)) { window.CHORDLE_OFFLINE_NOTE = '联机服务还没配置好（服务器缺少 Redis），可以先单人玩。'; return null; }
      return { join: async n => joinRoom(n) };
    },
  };
})();
