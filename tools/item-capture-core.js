/* Shared read-only item evidence collector: no game commands, no UID inference. */
function createRoItemCapture(env) {
  var session = String(env.session), sequence = 0, queue = [], busy = false, retryAt = 0;
  var storageKey = "dsh_item_evidence_outbox_v1", recordPrefix = "dsh_item_evidence_v1:", maxQueue = 128, maxBytes = 1048576;
  var memoryOnly = new Set(), ignoredKeys = new Set(), quarantinePrefix = "dsh_item_evidence_quarantine_v1:";
  var state = { received: 0, snapshots: 0, acknowledged: 0, pending: 0, invalid: 0, error: "", lastPacketAt: 0, lastAckAt: 0, transport: "idle" };
  var knownOps = [160,163,164,165,166,170,172,175,242,244,246,248,452,494,496,661,662,666,720,721,724,744,746,2448,2449,2450,2453,2454,2457,2458,2570,2572,2573,2576,2615,2824,2825,2826,2827,2873,2881,2884];
  var pendingIdentity = null, remainder = null, remainderEpoch = null;
  state.messages = 0; state.framingErrors = 0;
  function safeInt(v) { return typeof v === "number" && Number.isSafeInteger(v); }
  function identity() {
    var x = env.identity() || {}, cid = safeInt(x.charId) && x.charId > 0 ? x.charId : null;
    // Unknown realm/account must remain unknown; caller cannot promote defaults to a verified OneID.
    return { charId: cid, oneId: null, realm: null, status: "partial" };
  }
  function item(it) {
    if (!it || typeof it !== "object") return null;
    var id = it.ITID != null ? it.ITID : it.itemid;
    if (!safeInt(id) || id <= 0) return null;
    var out = { index: null, itemId: id, type: null, count: null, refine: null, identified: null, damaged: null, location: null, wearState: null, cards: null, options: null, enchantgrade: null, uidCandidates: {}, unknownFields: [] };
    var pairs = { index: ["index"], type: ["type", "itemType"], count: ["count", "amount"], refine: ["RefiningLevel", "refine"], location: ["location"], wearState: ["WearState", "wearState"], enchantgrade: ["enchantgrade"] };
    Object.keys(pairs).forEach(function (k) { var keys = pairs[k]; for (var i = 0; i < keys.length; i++) { if (safeInt(it[keys[i]]) && it[keys[i]] >= 0) { out[k] = it[keys[i]]; break; } } });
    [ ["identified", "IsIdentified"], ["damaged", "IsDamaged"] ].forEach(function (p) { if (typeof it[p[1]] === "boolean" || it[p[1]] === 0 || it[p[1]] === 1) out[p[0]] = !!it[p[1]]; });
    if (it.slot && typeof it.slot === "object") { var cards = Array.isArray(it.slot) ? it.slot : Object.keys(it.slot).sort().map(function(k){return it.slot[k];}); if (cards.length <= 4 && cards.every(function(n){return safeInt(n)&&n>=0;})) out.cards = cards; }
    var raw = it.options || it.Options;
    if (raw && typeof raw === "object") {
      var rows = [], valid = true;
      var base = raw[0] && typeof raw[0] === "object" ? 0 : 1;
      var flatBase = raw.Index0 !== undefined ? 0 : 1;
      var knownFormat = Array.isArray(raw) || raw[base] || raw["Index"+flatBase] !== undefined;
      for (var s = 0; s < 5; s++) {
        var o = raw[base+s];
        if (!o && !Array.isArray(raw) && raw["Index"+(flatBase+s)] !== undefined) o = { index: raw["Index"+(flatBase+s)], value: raw["Value"+(flatBase+s)], param: raw["Param"+(flatBase+s)] };
        if (!o) continue;
        if (!safeInt(o.index) || !safeInt(o.value) || !safeInt(o.param)) { valid = false; continue; }
        if (o.index) rows.push({ index: o.index, value: o.value, param: o.param });
      }
      if (valid && knownFormat) out.options = rows;
    }
    ["UniqueID", "uniqueId", "unique_id", "UID", "uid", "itemUID", "ItemUID", "GUID", "guid", "serial"].forEach(function (k) {
      var v = it[k];
      if (typeof v === "bigint") out.uidCandidates[k] = v.toString();
      else if (typeof v === "string" && /^[A-Za-z0-9:_-]{1,100}$/.test(v)) out.uidCandidates[k] = v;
      else if (safeInt(v)) out.uidCandidates[k] = String(v);
      else if (Array.isArray(v) && v.length === 2 && v.every(function(n){return safeInt(n) && n >= 0 && n <= 4294967295;})) out.uidCandidates[k] = "raw-u32-pair:" + v.join(",");
      else if (v !== undefined) out.unknownFields.push("uidCandidates." + k);
    });
    Object.keys(out).forEach(function(k){if(out[k]===null)out.unknownFields.push(k);});
    return out;
  }
  function definitionAllowed(d) {
    return d && safeInt(d.op) && knownOps.includes(d.op) && typeof d.name === "string" && (
      /^(?:NORMAL_ITEMLIST|EQUIPMENT_ITEMLIST|STORE_NORMAL_ITEMLIST|STORE_EQUIPMENT_ITEMLIST|ITEM_PICKUP_ACK|ADD_ITEM_TO_STORE)(?:_?V?\d+)?$/.test(d.name) ||
      /^(?:INVENTORY_START|INVENTORY_ITEMLIST|INVENTORY_ITEMLIST_EQUIP|INVENTORY_END|SPLIT_SEND_ITEMLIST_SET|SPLIT_SEND_ITEMLIST_NORMAL|SPLIT_SEND_ITEMLIST_EQUIP|SPLIT_SEND_ITEMLIST_EQUIP2|SPLIT_SEND_ITEMLIST_RESULT|ITEM_THROW_ACK|DELETE_ITEM_FROM_STORE|CLOSE_STORE|NOTIFY_STOREITEM_COUNTINFO|ITEM_DISAPPEAR|DELETE_ITEM_FROM_BODY|REQ_WEAR_EQUIP_ACK|ACK_WEAR_EQUIP_V5|REQ_TAKEOFF_EQUIP_ACK|ACK_TAKEOFF_EQUIP_V5)$/.test(d.name)
    );
  }
  function keys() {
    var out=[];
    for(var i=0;i<env.storage.length;i++){var k=env.storage.key(i);if(k && k.indexOf(recordPrefix)===0)out.push(k);}
    return out;
  }
  function allowedFields(o,fields) {return o && typeof o==="object" && !Array.isArray(o) && Object.keys(o).every(function(k){return fields.includes(k);});}
  function validRecord(r) {
    if(!allowedFields(r,["id","at","kind","session","epoch","identity","packet","snapshot"]) || typeof r.id!=="string" || !r.id || r.id.length>100 || typeof r.session!=="string" || r.session.length>100 || !safeInt(r.at)||r.at<0||!safeInt(r.epoch)||r.epoch<0)return false;
    var owner=r.identity;
    if(!allowedFields(owner,["charId","oneId","realm","status"]) || !(owner.charId===null || safeInt(owner.charId)&&owner.charId>0) || owner.oneId!==null || owner.realm!==null || owner.status!=="partial")return false;
    if(r.kind==="packet") {
      var p=r.packet;
      if(r.snapshot!==undefined||!allowedFields(p,["op","name","bytes","hex","framing"]) || p.framing!=="exact" || !safeInt(p.op) || !knownOps.includes(p.op) || !safeInt(p.bytes)||p.bytes<2||p.bytes>65535 || typeof p.hex!=="string"||p.hex.length!==p.bytes*2||!/^(?:[0-9a-f]{2})+$/.test(p.hex))return false;
      var specs={160:["ITEM_PICKUP_ACK",23],163:["NORMAL_ITEMLIST",-1],164:["EQUIPMENT_ITEMLIST",-1],165:["STORE_NORMAL_ITEMLIST",-1],166:["STORE_EQUIPMENT_ITEMLIST",-1],170:["REQ_WEAR_EQUIP_ACK",9],172:["REQ_TAKEOFF_EQUIP_ACK",7],175:["ITEM_THROW_ACK",6],242:["NOTIFY_STOREITEM_COUNTINFO",6],244:["ADD_ITEM_TO_STORE",21],246:["DELETE_ITEM_FROM_STORE",8],248:["CLOSE_STORE",2],452:["ADD_ITEM_TO_STORE2",22],494:["NORMAL_ITEMLIST2",-1],496:["STORE_NORMAL_ITEMLIST2",-1],661:["EQUIPMENT_ITEMLIST2",-1],662:["STORE_EQUIPMENT_ITEMLIST2",-1],666:["ITEM_PICKUP_ACK2",27],720:["EQUIPMENT_ITEMLIST3",-1],721:["STORE_EQUIPMENT_ITEMLIST3",-1],724:["ITEM_PICKUP_ACK3",29],744:["NORMAL_ITEMLIST3",-1],746:["STORE_NORMAL_ITEMLIST3",-1],2448:["ITEM_PICKUP_ACK5",31],2449:["NORMAL_ITEMLIST4",-1],2450:["EQUIPMENT_ITEMLIST4",-1],2453:["STORE_NORMAL_ITEMLIST4",-1],2454:["STORE_EQUIPMENT_ITEMLIST4",-1],2457:["ACK_WEAR_EQUIP_V5",11],2458:["ACK_TAKEOFF_EQUIP_V5",9],2570:["ADD_ITEM_TO_STORE3",[47,57]],2572:["ITEM_PICKUP_ACK6",56],2573:["EQUIPMENT_ITEMLIST5",-1],2576:["STORE_EQUIPMENT_ITEMLIST5",-1],2615:["ITEM_PICKUP_ACK7",[59,69]],2824:["SPLIT_SEND_ITEMLIST_SET",-1],2825:["SPLIT_SEND_ITEMLIST_NORMAL",-1],2826:["SPLIT_SEND_ITEMLIST_EQUIP",-1],2827:["SPLIT_SEND_ITEMLIST_RESULT",4],2873:["SPLIT_SEND_ITEMLIST_EQUIP2",-1],2881:["ITEM_PICKUP_ACK8",70],2884:["ADD_ITEM_TO_STORE4",58]};
      var spec=specs[p.op],aliases={2824:"INVENTORY_START",2825:"INVENTORY_ITEMLIST",2826:"INVENTORY_ITEMLIST_EQUIP",2873:"INVENTORY_ITEMLIST_EQUIP",2827:"INVENTORY_END"};
      if(!spec||typeof p.name!=="string")return false;
      var name=p.name.replace(/^(?:PACKET\.)?ZC\./,"").replace(/_V(?=\d+$)/,"");
      if(name!==spec[0].replace(/_V(?=\d+$)/,"") && name!==aliases[p.op])return false;
      var raw=new Uint8Array(p.hex.match(/../g).map(function(s){return parseInt(s,16);})),dv=new DataView(raw.buffer);
      if(dv.getUint16(0,true)!==p.op)return false;
      if(spec[1]===-1){if(raw.length<4||dv.getUint16(2,true)!==raw.length)return false;}else if(!(Array.isArray(spec[1])?spec[1]:[spec[1]]).includes(raw.length))return false;
      if([2824,2825,2826,2873].includes(p.op)&&(raw.length<5||raw[4]>2))return false;
      if(p.op===2827&&raw[2]>2)return false;
      if(p.op===2824){var label="";for(var j=5;j<raw.length;j++)label+=String.fromCharCode(raw[j]);label=label.replace(/\0+$/,"");if(!["","inventory","Inventory","equipment","Equipment","storage","Storage","cart","Cart"].includes(label))return false;}
      return true;
    }
    var s=r.snapshot;
    if(r.kind!=="snapshot"||r.packet!==undefined||!allowedFields(s,["source","complete","observedCount","items"])||!["inventory","equipment","storage"].includes(s.source)||s.complete!==false||!safeInt(s.observedCount)||s.observedCount<0||!Array.isArray(s.items)||s.items.length>200||s.observedCount<s.items.length)return false;
    return s.items.every(function(it){
      if(!allowedFields(it,["index","itemId","type","count","refine","identified","damaged","location","wearState","cards","options","enchantgrade","uidCandidates","unknownFields"]))return false;
      if(!Array.isArray(it.unknownFields)||it.unknownFields.length>64||!it.unknownFields.every(function(v){return typeof v==="string"&&v.length<=100;}))return false;
      for(var k of ["index","itemId","type","count","refine","location","wearState","enchantgrade"]){if(it[k]!==undefined&&it[k]!==null&&(!safeInt(it[k])||it[k]<0))return false;}
      for(var b of ["identified","damaged"]){if(it[b]!==undefined&&it[b]!==null&&typeof it[b]!=="boolean"&&it[b]!==0&&it[b]!==1)return false;}
      if(it.cards!==undefined&&it.cards!==null&&(!Array.isArray(it.cards)||it.cards.length>4||!it.cards.every(function(n){return safeInt(n)&&n>=0;})))return false;
      if(it.options!==undefined&&it.options!==null&&(!Array.isArray(it.options)||it.options.length>5||!it.options.every(function(o){return allowedFields(o,["id","index","value","param"])&&Object.keys(o).length>0&&Object.values(o).every(safeInt);})))return false;
      return it.uidCandidates===undefined||(allowedFields(it.uidCandidates,["UniqueID","uniqueId","unique_id","UID","uid","itemUID","ItemUID","GUID","guid","serial"])&&Object.values(it.uidCandidates).every(function(v){return typeof v==="string"&&v.length<=200;}));
    });
  }
  function safeRecord(rec) {try{return validRecord(rec);}catch(e){return false;}}
  function quarantine(key,text) {
    ignoredKeys.add(key);state.quarantined++;
    try{
      var used=0,count=0;for(var i=0;i<env.storage.length;i++){var k=env.storage.key(i);if(k&&k.indexOf(quarantinePrefix)===0){count++;used+=(env.storage.getItem(k)||"").length;}}
      if(count>=maxQueue||used+text.length>maxBytes)return;
      var dst=quarantinePrefix+key.slice(recordPrefix.length);
      if(env.storage.getItem(dst)!=null&&env.storage.getItem(dst)!==text)dst+=":"+session;
      env.storage.setItem(dst,text);env.storage.removeItem(key);
    }catch(e){}
  }
  function persistRecord(rec) {
    state.pending=queue.length;
    try{env.storage.setItem(recordPrefix+rec.id,JSON.stringify(rec));memoryOnly.delete(rec.id);state.memoryOnly=memoryOnly.size;if(!state.memoryOnly&&state.error.indexOf("浏览器待送保存失败")===0)state.error="";return true;}
    catch(e){memoryOnly.add(rec.id);state.memoryOnly=memoryOnly.size;state.error="浏览器待送保存失败，当前仅在内存；刷新可能丢失";return false;}
  }
  function enqueue(rec) {
    if(!safeRecord(rec)){state.invalid++;state.error="证据字段或包契约不合法，未入队";return false;}
    var list=keys().filter(function(k){return !ignoredKeys.has(k);}),total=JSON.stringify(rec).length;
    for(var k of list){total+=(env.storage.getItem(k)||"").length;}
    if(queue.length>=maxQueue||list.length>=maxQueue||total>maxBytes){state.error="物品采集待送队列已满；新证据未保存";return false;}
    queue.push(rec);state.pending=queue.length;return persistRecord(rec);
  }
  function record(kind, owner, epoch) {
    return { id: session + ":" + (++sequence), at: env.now(), kind: kind, session: session, epoch: safeInt(epoch) && epoch >= 0 ? epoch : 0, identity: owner };
  }
  function packet(bytes, d) {
    try {
      if (!definitionAllowed(d)) return false;
      var u8 = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : (ArrayBuffer.isView(bytes) ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : null);
      if (!u8 || u8.length < 2 || u8.length > 65535) { state.invalid++; return false; }
      var view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      if (view.getUint16(0, true) !== d.op || !safeInt(d.size) || d.size === 0 || (d.size > 0 && d.size !== u8.length) || (d.size < 0 && (u8.length < 4 || view.getUint16(2, true) !== u8.length))) { state.invalid++; return false; }
      if ([2824,2825,2826,2873].includes(d.op) && (u8.length < 5 || u8[4] > 2)) { state.invalid++; return false; }
      if (d.op === 2827 && u8[2] > 2) { state.invalid++; return false; }
      if (d.op === 2824) {
        var label = ""; for (var l=5;l<u8.length;l++) { if (!u8[l]) break; label += String.fromCharCode(u8[l]); }
        if (!["","inventory","Inventory","equipment","Equipment","storage","Storage","cart","Cart"].includes(label)) {state.invalid++;return false;}
      }
      var owner = identity(), epoch = env.epoch();
      // A packet without a current role remains an explicitly unassigned observation.
      var rec = record("packet", owner, epoch), hex = "";
      for (var i = 0; i < u8.length; i++) hex += u8[i].toString(16).padStart(2, "0");
      rec.packet = { op: d.op, name: d.name, bytes: u8.length, hex: hex, framing: "exact" };
      if (!enqueue(rec)) return false;
      state.received++; state.lastPacketAt = rec.at;
      pendingIdentity = { identity: owner, epoch: epoch };
      return true;
    } catch (e) { state.error = "物品消息采集异常"; return false; }
  }
  function message(data, definitions) {
    try {
      var u = data instanceof ArrayBuffer ? new Uint8Array(data) : (ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null);
      if (!u) return false;
      state.messages++;
      if (remainder && remainderEpoch !== env.epoch()) remainder = null;
      if (remainder) { var merged = new Uint8Array(remainder.length + u.length); merged.set(remainder); merged.set(u, remainder.length); u = merged; remainder = null; }
      if (u.length > 1048576) { state.framingErrors++; state.error = "入站消息过大，未采集"; return false; }
      var pos = 0;
      while (pos < u.length) {
        if (u.length - pos < 2) break;
        var view = new DataView(u.buffer,u.byteOffset+pos,u.length-pos), op = view.getUint16(0,true), d = definitions[op];
        if (!d || !safeInt(d.size) || !d.size) { state.framingErrors++; state.error = "消息边界未知，未保存尾部"; return false; }
        var len = d.size;
        if (len < 0) { if (u.length - pos < 4) break; len = view.getUint16(2,true); if (len < 4) { state.framingErrors++; return false; } }
        if (len > 65535 || len < 2) { state.framingErrors++; return false; }
        if (pos + len > u.length) break;
        if (definitionAllowed(d)) packet(u.subarray(pos,pos+len),d);
        pos += len;
      }
      if (pos < u.length) { remainder = u.slice(pos); remainderEpoch = env.epoch(); }
      return true;
    } catch(e) { remainder = null; state.framingErrors++; state.error = "消息分段读取失败"; return false; }
  }
  function snapshot(source, list, owner, epoch) {
    if (!["inventory", "equipment", "storage"].includes(source) || !Array.isArray(list)) return false;
    var mine = identity();
    if (owner && (owner.charId !== mine.charId || epoch !== env.epoch())) { state.error = "会话变化，跳过旧来源快照"; return false; }
    var observedCount = list.length;
    var items = list.slice(0, 200).map(item).filter(Boolean);
    var rec = record("snapshot", owner || mine, epoch == null ? env.epoch() : epoch);
    rec.snapshot = { source: source, complete: false, observedCount: observedCount, items: items };
    if (!enqueue(rec)) return false;
    state.snapshots++; return true;
  }
  function tick() {
    if (pendingIdentity && typeof env.snapshot === "function") {
      var pending = pendingIdentity; pendingIdentity = null;
      try { env.snapshot(api, pending.identity, pending.epoch); } catch(e) { state.error = "物品观察快照读取失败"; }
    }
    if (busy || !queue.length || env.now() < retryAt) return;
    busy = true; state.transport = "sending";
    var head = queue[0];
    if(!safeRecord(head)){queue.shift();state.pending=queue.length;state.invalid++;state.error="非法待送证据已隔离";busy=false;return;}
    if(memoryOnly.has(head.id))persistRecord(head);
    Promise.resolve().then(function(){return env.request(head);}).then(function(ack){
      if (!ack || ack.ok !== true || ack.persisted !== true || ack.id !== head.id) throw Error("missing persistence acknowledgement");
      queue.shift(); state.pending=queue.length;memoryOnly.delete(head.id);state.memoryOnly=memoryOnly.size;
      try{env.storage.removeItem(recordPrefix+head.id);}catch(e){state.error="确认后浏览器队列清理失败；重启将安全重送";}
      state.acknowledged++; state.lastAckAt = env.now(); state.transport = "acknowledged";
      if (state.error === "本机接收端未确认落盘") state.error = "";
    }).catch(function(){ state.error = "本机接收端未确认落盘"; state.transport = "retry-wait"; retryAt = env.now() + 10000; }).finally(function(){busy=false;});
  }
  state.memoryOnly=0;state.quarantined=0;
  try {
    var legacy=env.storage.getItem(storageKey),migrated=true;
    if(legacy){try{var old=JSON.parse(legacy);if(!Array.isArray(old)||old.length>maxQueue||legacy.length>maxBytes)throw Error("legacy invalid");for(var r of old){if(!safeRecord(r)){migrated=false;state.quarantined++;continue;}try{env.storage.setItem(recordPrefix+r.id,JSON.stringify(r));}catch(e){migrated=false;}}if(migrated)env.storage.removeItem(storageKey);}catch(eLegacy){state.quarantined++;state.error="旧格式队列损坏，原数据隔离保留";}}
    var total=0;
    for(var key of keys().sort()){var text=env.storage.getItem(key)||"";if(!text)continue;var rec=null;if(text.length<=maxBytes){try{rec=JSON.parse(text);}catch(e){}}if(!safeRecord(rec)||key!==recordPrefix+rec.id){quarantine(key,text);continue;}total+=text.length;if(total>maxBytes||queue.length>=maxQueue){state.error="恢复队列达到容量上限，其余记录仍保留";break;}queue.push(rec);}
    state.pending=queue.length;
    if(state.quarantined)state.error="非法旧证据已隔离保留，不发送";
  } catch(e) { state.error="旧待送队列损坏，未恢复；原数据保留"; }
  var api = { hasOpcode: function(op){return knownOps.includes(op);}, packet: packet, message: message, snapshot: snapshot, tick: tick, status: function(){return Object.assign({},state);}, normalizeItem: item, definitionAllowed: definitionAllowed };
  return api;
}
if (typeof module !== "undefined" && module.exports) module.exports = { createRoItemCapture: createRoItemCapture };
