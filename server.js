const express = require('express');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
app.use(express.static('public'));

const clients = new Set();
let conn = null;

function send(type, data) {
  const msg = `data: ${JSON.stringify({ type, data })}\n\n`;
  clients.forEach(res => res.write(msg));
}

app.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

app.get('/connect', async (req, res) => {
  const user = String(req.query.user || '').replace('@', '').trim();
  if (!user) return res.status(400).json({ ok: false, error: 'اكتب اسم الحساب' });
  if (conn) { try { conn.disconnect(); } catch (e) {} }
  conn = new WebcastPushConnection(user);
  try {
    await conn.connect();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'ما كدرت أتصل. تأكد إن البث شغال واسم الحساب صحيح.' });
  }

  const joined = new Set(), followed = new Set(), lastLike = {}, lastShare = {};
  const who = d => ({ name: d.nickname || d.uniqueId, pic: d.profilePictureUrl || '' });
  const throttle = (map, id, ms) => {
    const now = Date.now();
    if (map[id] && now - map[id] < ms) return false;
    map[id] = now; return true;
  };

  conn.on('gift', d => {
    if (d.giftType === 1 && !d.repeatEnd) return;
    send('print', { kind: 'gift', ...who(d), gift: d.giftName, count: d.repeatCount || 1 });
  });
  conn.on('like', d => {
    if (throttle(lastLike, d.uniqueId, 30000)) send('print', { kind: 'like', ...who(d) });
  });
  conn.on('member', d => {
    if (!joined.has(d.uniqueId)) { joined.add(d.uniqueId); send('print', { kind: 'join', ...who(d) }); }
  });
  conn.on('follow', d => {
    if (!followed.has(d.uniqueId)) { followed.add(d.uniqueId); send('print', { kind: 'follow', ...who(d) }); }
  });
  conn.on('share', d => {
    if (throttle(lastShare, d.uniqueId, 30000)) send('print', { kind: 'share', ...who(d) });
  });

  res.json({ ok: true, user });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('يشتغل على المنفذ ' + PORT));
