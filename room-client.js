// Stand-in for the claude.ai `room` capability, backed by /api/room.
// Each tab checks in every 1.5 s with its own state and receives everyone else's.
// Hidden tabs slow down to save requests; a failed or hung request is retried and shows as "reconnecting".
(() => {
  if (window.claude && window.claude.use) return;
  const me = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => (b % 36).toString(36)).join('');
  const POLL_MS = 1500, HIDDEN_MS = 6000, BEAT_MS = 15000, TIMEOUT_MS = 8000, MAX_BACKOFF_MS = 5000;

  function joinRoom(name) {
    // One request at a time: `ver` counts local presence changes, `sentVer` the last one the server has.
    let mine = {}, ver = 1, sentVer = 0, lastSent = 0, alive = true, busy = false, timer = null, cache = [], last = '';
    let fails = 0, online = true;
    const subs = new Set(), connSubs = new Set();
    const setOnline = v => { if (v !== online) { online = v; connSubs.forEach(f => { try { f(v); } catch (e) {} }); } };
    const toPeer = p => Object.freeze({
      peer: p.peer, by: null, isMe: p.peer === me, sameTab: p.peer === me, kind: 'viewer', guest: false,
      presence: Object.freeze(p.peer === me ? { ...mine } : (p.presence || {})), updatedAt: p.at || Date.now(),
    });
    const schedule = ms => { clearTimeout(timer); if (alive) timer = setTimeout(tick, ms); };
    async function tick() {
      if (!alive || busy) return;
      busy = true;
      const v = ver, send = v !== sentVer || Date.now() - lastSent > BEAT_MS;
      const ctl = new AbortController(), kill = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      let ok = false;
      try {
        const r = await fetch('/api/room', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
          body: JSON.stringify(send ? { room: name, peer: me, presence: mine } : { room: name, peer: me }),
        });
        if (r.ok) {
          ok = true;
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
      clearTimeout(kill);
      busy = false;
      fails = ok ? 0 : fails + 1;
      if (!ok) lastSent = 0;   // whatever the server lost, the next check-in carries our full state
      setOnline(fails < 2);
      const base = document.hidden ? HIDDEN_MS : POLL_MS;
      schedule(!ok ? Math.min(base * 2 ** (fails - 1), Math.max(base, MAX_BACKOFF_MS)) : ver !== sentVer ? 60 : base);
    }
    const leaveBeacon = () => { try { navigator.sendBeacon('/api/room', new Blob([JSON.stringify({ room: name, peer: me, leave: true })], { type: 'application/json' })); } catch (e) {} };
    // Coming back to the tab (or out of the back/forward cache): check in at once and re-announce ourselves.
    const wake = () => { if (!document.hidden) { lastSent = 0; if (!busy) schedule(0); } };
    window.addEventListener('pagehide', leaveBeacon);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pageshow', wake);
    window.addEventListener('online', wake);
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
      connected() { return alive && online; },
      onConnection(f) { connSubs.add(f); setTimeout(() => f(alive && online)); return () => connSubs.delete(f); },
      leave() {
        alive = false; clearTimeout(timer); subs.clear(); connSubs.clear();
        window.removeEventListener('pagehide', leaveBeacon); document.removeEventListener('visibilitychange', wake);
        window.removeEventListener('pageshow', wake); window.removeEventListener('online', wake);
        leaveBeacon(); return Promise.resolve();
      },
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
