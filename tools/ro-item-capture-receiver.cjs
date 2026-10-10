'use strict';

// Independent evidence sink. Node stdlib only; no login, upload, role tagging or UID inference.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const BODY_LIMIT = 300 * 1024;
const DISK_LIMIT = 32 * 1024 * 1024;

// Audited against local PC/mn PacketRegister + Ragna.roBrowser PacketStructure.
// size=0 wear ACK classes are structurally 9 and 11 bytes, NOT variable packets.
const PACKETS = new Map([
  [160, ['ITEM_PICKUP_ACK', 23]],
  [163, ['NORMAL_ITEMLIST', -1]], [164, ['EQUIPMENT_ITEMLIST', -1]],
  [165, ['STORE_NORMAL_ITEMLIST', -1]], [166, ['STORE_EQUIPMENT_ITEMLIST', -1]],
  [170, ['REQ_WEAR_EQUIP_ACK', 9]], [172, ['REQ_TAKEOFF_EQUIP_ACK', 7]],
  [175, ['ITEM_THROW_ACK', 6]], [242, ['NOTIFY_STOREITEM_COUNTINFO', 6]],
  [244, ['ADD_ITEM_TO_STORE', 21]], [246, ['DELETE_ITEM_FROM_STORE', 8]],
  [248, ['CLOSE_STORE', 2]], [452, ['ADD_ITEM_TO_STORE2', 22]],
  [494, ['NORMAL_ITEMLIST2', -1]], [496, ['STORE_NORMAL_ITEMLIST2', -1]],
  [661, ['EQUIPMENT_ITEMLIST2', -1]], [662, ['STORE_EQUIPMENT_ITEMLIST2', -1]],
  [666, ['ITEM_PICKUP_ACK2', 27]],
  [720, ['EQUIPMENT_ITEMLIST3', -1]], [721, ['STORE_EQUIPMENT_ITEMLIST3', -1]],
  [724, ['ITEM_PICKUP_ACK3', 29]],
  [744, ['NORMAL_ITEMLIST3', -1]], [746, ['STORE_NORMAL_ITEMLIST3', -1]],
  [2448, ['ITEM_PICKUP_ACK5', 31]], [2449, ['NORMAL_ITEMLIST4', -1]],
  [2450, ['EQUIPMENT_ITEMLIST4', -1]], [2453, ['STORE_NORMAL_ITEMLIST4', -1]],
  [2454, ['STORE_EQUIPMENT_ITEMLIST4', -1]],
  [2457, ['ACK_WEAR_EQUIP_V5', 11]], [2458, ['ACK_TAKEOFF_EQUIP_V5', 9]],
  [2570, ['ADD_ITEM_TO_STORE3', [47, 57]]], [2572, ['ITEM_PICKUP_ACK6', 56]],
  [2573, ['EQUIPMENT_ITEMLIST5', -1]], [2576, ['STORE_EQUIPMENT_ITEMLIST5', -1]],
  [2615, ['ITEM_PICKUP_ACK7', [59, 69]]],
  [2824, ['SPLIT_SEND_ITEMLIST_SET', -1]], [2825, ['SPLIT_SEND_ITEMLIST_NORMAL', -1]],
  [2826, ['SPLIT_SEND_ITEMLIST_EQUIP', -1]], [2827, ['SPLIT_SEND_ITEMLIST_RESULT', 4]],
  [2873, ['SPLIT_SEND_ITEMLIST_EQUIP2', -1]],
  [2881, ['ITEM_PICKUP_ACK8', 70]], [2884, ['ADD_ITEM_TO_STORE4', 58]]
]);
const ITEM_FIELDS = ['index', 'itemId', 'type', 'count', 'refine', 'identified',
  'damaged', 'location', 'wearState', 'cards', 'options', 'enchantgrade',
  'uidCandidates', 'unknownFields'];
const int = Number.isSafeInteger;
const nonnegative = x => int(x) && x >= 0;
const str = (x, max) => typeof x === 'string' && x.length <= max;
const has = (o, k) => Object.hasOwn(o, k);
function check(ok) { if (!ok) throw new Error('invalid_schema'); }
function fields(o, allowed, required = allowed) {
  check(o !== null && typeof o === 'object' && !Array.isArray(o));
  check(Object.keys(o).every(k => allowed.includes(k)) && required.every(k => has(o, k)));
}
function stringArray(a, count, length) {
  check(Array.isArray(a) && a.length <= count && a.every(v => str(v, length)));
}
function validateItem(item) {
  fields(item, ITEM_FIELDS, ['unknownFields']);
  for (const k of ['index', 'itemId', 'type', 'count', 'refine', 'location', 'wearState', 'enchantgrade']) {
    if (has(item, k) && item[k] !== null) check(nonnegative(item[k]));
  }
  for (const k of ['identified', 'damaged']) {
    if (has(item, k)) check(item[k] === null || typeof item[k] === 'boolean' || item[k] === 0 || item[k] === 1);
  }
  if (has(item, 'cards') && item.cards !== null) check(Array.isArray(item.cards) && item.cards.length <= 4 && item.cards.every(nonnegative));
  if (has(item, 'uidCandidates')) {
    if (Array.isArray(item.uidCandidates)) stringArray(item.uidCandidates, 16, 200);
    else {
      fields(item.uidCandidates, ['UniqueID','uniqueId','unique_id','UID','uid','itemUID','ItemUID','GUID','guid','serial'], []);
      check(Object.values(item.uidCandidates).every(v => str(v, 200)));
    }
  }
  stringArray(item.unknownFields, 64, 100);
  if (has(item, 'options') && item.options !== null) {
    check(Array.isArray(item.options) && item.options.length <= 5);
    for (const option of item.options) {
      fields(option, ['id', 'index', 'value', 'param'], []);
      check(Object.keys(option).length > 0 && Object.values(option).every(int));
    }
  }
}
function validatePacket(p) {
  fields(p, ['op', 'name', 'hex', 'bytes', 'framing']);
  check(int(p.op) && PACKETS.has(p.op));
  const [name, size] = PACKETS.get(p.op);
  // Only namespace aliases of this exact numeric family; never substring matching.
  const aliases = {2824:'INVENTORY_START',2825:'INVENTORY_ITEMLIST',2826:'INVENTORY_ITEMLIST_EQUIP',2873:'INVENTORY_ITEMLIST_EQUIP',2827:'INVENTORY_END'};
  const supplied = typeof p.name === 'string' ? p.name.replace(/^(?:PACKET\.)?ZC\./, '').replace(/_V(?=\d+$)/, '') : '';
  check(supplied === name.replace(/_V(?=\d+$)/, '') || (aliases[p.op] && supplied === aliases[p.op]));
  check(p.framing === 'exact' && nonnegative(p.bytes) && p.bytes >= 2);
  check(str(p.hex, 131070) && /^(?:[0-9a-f]{2})+$/.test(p.hex) && p.hex.length === p.bytes * 2);
  const bytes = Buffer.from(p.hex, 'hex');
  check(bytes.readUInt16LE(0) === p.op);
  if (size === -1) {
    check(p.bytes >= (p.op >= 2824 ? 5 : 4) && bytes.readUInt16LE(2) === p.bytes);
  } else check((Array.isArray(size) ? size : [size]).includes(p.bytes));
  // Split packets carry only inventory/cart/storage types 0/1/2.
  if ([2824, 2825, 2826, 2873].includes(p.op)) check(bytes[4] <= 2);
  if (p.op === 2827) check(bytes[2] <= 2);
  // Set's free-text container name is NOT an item payload: allow only known labels.
  if (p.op === 2824) {
    const label = bytes.subarray(5).toString('utf8').replace(/\0+$/, '');
    check(['', 'inventory', 'Inventory', 'equipment', 'Equipment', 'storage', 'Storage', 'cart', 'Cart'].includes(label));
  }
}
function validateEvent(event) {
  fields(event, ['schema', 'record']); check(event.schema === 1);
  const r = event.record;
  fields(r, ['id', 'at', 'kind', 'session', 'epoch', 'identity', 'packet', 'snapshot'],
    ['id', 'at', 'kind', 'session', 'epoch', 'identity']);
  check(str(r.id, 100) && r.id.length > 0 && str(r.session, 100));
  check(nonnegative(r.at) && nonnegative(r.epoch));
  fields(r.identity, ['charId', 'oneId', 'realm', 'status']);
  check(r.identity.charId === null || (int(r.identity.charId) && r.identity.charId > 0));
  check(r.identity.oneId === null || str(r.identity.oneId, 200));
  check(r.identity.realm === null || str(r.identity.realm, 20));
  check(['partial', 'verified'].includes(r.identity.status));
  if (r.kind === 'packet') {
    check(has(r, 'packet') && !has(r, 'snapshot')); validatePacket(r.packet);
  } else {
    check(r.kind === 'snapshot' && has(r, 'snapshot') && !has(r, 'packet'));
    const s = r.snapshot;
    fields(s, ['source', 'complete', 'items', 'observedCount']);
    check(['inventory', 'equipment', 'storage'].includes(s.source) && s.complete === false);
    check(nonnegative(s.observedCount) && Array.isArray(s.items) && s.items.length <= 200);
    check(s.observedCount >= s.items.length); s.items.forEach(validateItem);
  }
  return event;
}
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v !== null && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
function digest(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function loopback(host) { return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1'; }
function trustedOrigin(origin) {
  if (typeof origin !== 'string') return false;
  try {
    const u = new URL(origin);
    if (u.origin !== origin || u.username || u.password) return false;
    if (['http:', 'https:'].includes(u.protocol) && ['game.lastro.cn', 'post.lastro.cn'].includes(u.hostname)) return !u.port;
    return u.protocol === 'http:' && loopback(u.hostname);
  } catch { return false; }
}
function trustedHost(host) {
  if (typeof host !== 'string') return false;
  try { const u = new URL('http://' + host); return !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash && loopback(u.hostname); }
  catch { return false; }
}
function directoryBytes(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile()) throw new Error('unexpected_log_entry');
    total += fs.statSync(path.join(dir, e.name)).size;
  }
  return total;
}
function createItemReceiver({ dir = path.resolve(process.cwd(), '.dsh-work/ro-items'), port = 8793, maxBytes = DISK_LIMIT } = {}) {
  if (!nonnegative(port) || port > 65535 || !int(maxBytes) || maxBytes < 1 || maxBytes > DISK_LIMIT) throw new Error('invalid_config');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const logPath = path.join(dir, 'events.jsonl');
  const seen = new Map();
  let poisoned = false;
  // ponytail: one bounded log / one local writer. No rotation, deletion or silent truncation.
  if (fs.existsSync(logPath)) {
    const stat = fs.lstatSync(logPath);
    if (!stat.isFile() || stat.size > DISK_LIMIT) throw new Error('invalid_or_oversized_log');
    const data = fs.readFileSync(logPath);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
    if (text && !text.endsWith('\n')) throw new Error('incomplete_log');
    for (const line of text.split('\n')) {
      if (!line) continue;
      if (Buffer.byteLength(line) > BODY_LIMIT) throw new Error('oversized_log_event');
      const event = validateEvent(JSON.parse(line));
      const hash = digest(canonical(event)), id = event.record.id;
      if (seen.has(id) && seen.get(id) !== hash) throw new Error('conflicting_log_id');
      seen.set(id, hash);
    }
  }
  directoryBytes(dir);
  function persist(event) {
    const text = canonical(event), hash = digest(text), id = event.record.id;
    if (poisoned) return 503;
    if (seen.has(id)) return seen.get(id) === hash ? 200 : 409;
    const data = Buffer.from(text + '\n');
    if (data.length > BODY_LIMIT) return 413;
    let fd, before;
    try {
      if (directoryBytes(dir) + data.length > maxBytes) return 507;
      fd = fs.openSync(logPath, fs.constants.O_CREAT | fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW || 0), 0o600);
      before = fs.fstatSync(fd).size;
      let offset = 0;
      while (offset < data.length) {
        const written = fs.writeSync(fd, data, offset, data.length - offset, before + offset);
        if (!written) throw new Error('short_write');
        offset += written;
      }
      fs.fsyncSync(fd);
      seen.set(id, hash);
      return 200;
    } catch (e) {
      // No ACK or dedup entry on failure. Restore only this failed append if possible.
      if (fd !== undefined && before !== undefined) {
        try { fs.ftruncateSync(fd, before); fs.fsyncSync(fd); } catch { poisoned = true; }
      }
      return ['ENOSPC', 'EDQUOT'].includes(e.code) ? 507 : 503;
    } finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch { poisoned = true; } } }
  }
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Origin, Access-Control-Request-Private-Network');
    function reply(status, data) {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(data === undefined ? undefined : JSON.stringify(data));
    }
    const origin = req.headers.origin;
    if (!trustedHost(req.headers.host) || (origin !== undefined && !trustedOrigin(origin))) {
      req.resume(); return reply(403, { ok: false, error: 'forbidden' });
    }
    if (origin !== undefined) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    if (req.method === 'OPTIONS') {
      req.resume();
      if (origin === undefined) return reply(403, { ok: false, error: 'origin_required' });
      if (!['/ro-item-capture', '/health'].includes(req.url)) return reply(404, { ok: false, error: 'not_found' });
      if (req.headers['access-control-request-method'] && !['POST', 'GET'].includes(req.headers['access-control-request-method'])) return reply(403, { ok: false, error: 'forbidden_method' });
      const requested = req.headers['access-control-request-headers'];
      if (requested && requested.split(',').some(h => h.trim().toLowerCase() !== 'content-type')) return reply(403, { ok: false, error: 'forbidden_headers' });
      return reply(204);
    }
    if (req.method === 'GET' && req.url === '/health') return reply(200, { ok: !poisoned, schema: 1 });
    if (req.method !== 'POST' || req.url !== '/ro-item-capture') { req.resume(); return reply(404, { ok: false, error: 'not_found' }); }
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '') || req.headers['content-encoding']) {
      req.resume(); return reply(415, { ok: false, error: 'json_required' });
    }
    const chunks = []; let received = 0, rejected = false;
    req.on('data', chunk => {
      if (rejected) return;
      received += chunk.length;
      if (received > BODY_LIMIT) { rejected = true; chunks.length = 0; reply(413, { ok: false, error: 'body_too_large' }); }
      else chunks.push(chunk);
    });
    req.on('error', () => { rejected = true; });
    req.on('end', () => {
      if (rejected) return;
      let event;
      try { event = validateEvent(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))); }
      catch { return reply(400, { ok: false, error: 'invalid_schema' }); }
      const status = persist(event);
      if (status === 200) reply(200, { ok: true, id: event.record.id, persisted: true });
      else reply(status, { ok: false, error: status === 409 ? 'id_conflict' : status === 507 ? 'disk_full' : status === 413 ? 'body_too_large' : 'persistence_failed' });
    });
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  server.start = () => new Promise((resolve, reject) => {
    const error = e => reject(e);
    server.once('error', error);
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', error); resolve(server); });
  });
  return server;
}
module.exports = { createItemReceiver };
if (require.main === module) {
  try {
    const server = createItemReceiver();
    server.start().then(() => console.log('Item evidence receiver listening at http://127.0.0.1:8793')).catch(() => { console.error('Receiver startup failed'); process.exitCode = 1; });
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
  } catch { console.error('Receiver startup failed'); process.exitCode = 1; }
}
