// ==UserScript==
// @name         仙境传说 · 脚本入口（独立版）
// @namespace    dsh.ro-plugin
// @version      1.0.15
// @updateURL    https://cdn.jsdelivr.net/gh/Keeee1th/ro-assist-dist@main/ro-infinite-dojo.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/Keeee1th/ro-assist-dist@main/ro-infinite-dojo.user.js
// @description  无限挑战（独立脚本）：到报名点报名，服务器确认本轮出怪后才代打；无怪不猜结算，付费选项需手动确认；需要先启用 RO 助手。
// @author       DSH
// @match        http://post.lastro.cn/*
// @match        https://post.lastro.cn/*
// @match        http://post.lastro.cn/ro/api.html*
// @match        https://post.lastro.cn/ro/api.html*
// @match        http://post.lastro.cn/ro/api-old.html*
// @match        https://post.lastro.cn/ro/api-old.html*
// @match        http://game.lastro.cn/*
// @match        https://game.lastro.cn/*
// @match        http://game.lastro.cn/ro/api.html*
// @match        https://game.lastro.cn/ro/api.html*
// @match        http://game.lastro.cn/ro/api-old.html*
// @match        https://game.lastro.cn/ro/api-old.html*
// @match        http://127.0.0.1:8971/client/api.html*
// @match        http://localhost:8971/client/api.html*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// ==/UserScript==
//
// ---------------- V1.0.0（独立版本线首版） ----------------
// 1. 道场从 RO 助手里搬出来独立发布：运行时只经助手的对外通道调用走路 / 对话 / 换箭 / 开战 / 飞行 / 传送，
//    本脚本自己不做任何一步动作，也不碰任何底层协议。
// 2. 新增全自动报名：传送到 普隆德拉 148,147 → 走 NPC 相邻格（绝不站 NPC 自己那格）→ 对话链
//    （下一步 → 无限挑战 → 我要报名 → 下一步）→ 进入道场转入战斗循环。
// 3. 修搬运时发现的问题：
//    a 相邻格走路 + 到达校验 + 每 2 秒重试 + 状态行写实际距离；
//    b 接触 / 对话失败必须给出原因（npc-not-found / contact-failed / invalid-menu …），连续失败有明确提示；
//    c 所有停止原因同时进状态行与日志（不再只进一边）；
//    d 开不起来（没进游戏 / 控制权被占 / 助手挂机在跑）写明原因，不静默结束；
//    e 副本内 NPC 别名可配置，找不到时把本图识别到的 NPC 名字与数量打进日志；
//    f 副本内无怪满 20 秒给出明确提示。
// 4. 全自动循环：打 → 每 N 轮结算或到顶结算 → 回报名点再开一轮；随时可停。
// 5. 界面优先复用助手浮窗；不可用时退回自建 RO 皮肤面板（不用旧蓝渐变）。
// 6. 已知契约缺口：助手暂无传送方法，本脚本按约定调用 teleport(owner,{map,x,y})（走 fly 权限）；
//    取不到时若已在报名地图则改用走近兜底，否则明确报「待助手侧实现」，不空转。
// 7. 可选本地配置：在扩展里为本脚本开启「允许访问文件网址」后，可读 file:///dsh-ro-infinite-dojo.config.json
//    覆盖坐标 / NPC 名 / 选项等；读不到一律用内置默认，绝不因此失败。
// ---------------- V1.0.1 ----------------
// 1. 入口阶段：进入报名阶段先无条件传送到报名点（不再看当前地图与坐标）；8 秒内没到位补发一次，
//    两次仍不到位就停手，并把助手返回的原因原文写进状态行与日志。
// 2. 战斗改由助手精灵代打（门面 assistCombat(owner,on)）：有活怪一律指定目标开战；初级难度不再等换箭；助手拒绝开战时立刻停手并写明原因。
// 3. 面板「用法/限制」同步：写明战斗由助手精灵代打、到报名点会消耗 1 个传送卷轴。
// ---------------- V1.0.2 ----------------
// 1. 取消换箭：本脚本不再申请换箭权限，也不再等换箭就绪，有活怪即开战，战斗全部交给助手精灵。
// 2. 拿到控制权后先做一次战斗准备：清空当前角色的锁定名单并改为攻击全部怪；释放控制权时还原「打全部怪」的原值。
// 3. 战斗中自动拾取地面上的卡片与装备；结算与停止时自动收起。
// 4. 面板「用法/限制」同步：写明代打、传送卷轴消耗与自动拾取范围。
// 5. 匹配放宽到 post / game 整站（各 2 条域名通配 + 原有具体 api 页），并在脚本最前面加页面闸门：
//    只有本机 8971、站内网址含 /ro/api 的页面、以及手机版入口（网址含 r=mn）才启动；
//    站点首页、登录页、公告页等一律不启动（不建面板、不挂定时器、不碰页面）。
// ---------------- V1.0.3 ----------------
// 打开游戏不再自动弹出面板；由助手「脚本执行」统一打开设置。
// ---------------- V1.0.4 ----------------
// 1. 修面板拖动与单击位置保持，入口由助手统一管理。
// ---------------- V1.0.5 ----------------
// 用户可见名称统一为「无限挑战（独立脚本）」，内部标识不变（下载地址 / 存储键 / 元素 id 照旧，老用户的设置与自动更新都不受影响）。
// ---------------- V1.0.12 ----------------
// 1. 去掉自建常驻悬浮按钮：按钮元素、容器、样式表、跟随助手悬浮球的定位与位置记录整层删除，
//    入口由助手「脚本执行」统一打开设置；内部浮窗注册保留，面板照旧不自动弹出。
// 2. 可见名称统一为「无限挑战（独立脚本）」：@name、助手浮窗标题、自建面板标题与助手通知文案一律用新名，不再保留旧名。

(function dojoMain() {
  'use strict';

  /* ==================== 页面闸门（必须最先执行） ====================
   * 与 RO 助手同语义，只有三类页面放行：
   *   ① 本机 127.0.0.1 / localhost 的 8971 端口（本机调试入口）；
   *   ② lastro.cn 站内网址含 /ro/api 的页面；
   *   ③ 手机版入口（网址含 r=mn）。
   * 站点首页、登录页、公告页等一律不启动：到这里直接 return，
   * 不建面板、不注入样式、不挂定时器与事件监听、不读配置。
   * 整体 try/catch，任何异常一律按「不放行」处理。 */
  function pageGateTarget() {
    var loc = null;
    try { loc = window.location; } catch (e) { loc = null; }
    var href = "";
    try { href = String((loc && loc.href) || ""); } catch (e) { href = ""; }
    var host = "", port = "";
    // 没有 hostname 的环境（测试夹具等）就从 href 里取；有 hostname / port 的以宿主给的为准
    var um = /^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\/([^\/?#]*)/.exec(href);
    if (um) {
      var auth = String(um[1]).replace(/^[^@]*@/, "");
      var pm = /^(\[[^\]]*\]|[^:]*)(?::(\d+))?$/.exec(auth);
      host = String(pm ? pm[1] : auth).toLowerCase();
      port = pm && pm[2] ? String(pm[2]) : "";
    }
    try {
      if (loc && loc.hostname) host = String(loc.hostname).toLowerCase();
      if (loc && loc.port) port = String(loc.port);
    } catch (e) {}
    return { href: href, host: host, port: port };
  }
  function pageAllowed() {
    var u = pageGateTarget();
    if ((u.host === "127.0.0.1" || u.host === "localhost") && u.port === "8971") return true;
    if (/(^|\.)lastro\.cn$/.test(u.host) && u.href.indexOf("/ro/api") >= 0) return true;
    if (u.href.indexOf("r=mn") >= 0) return true;
    return false;
  }
  var PAGE_OK = false;
  try { PAGE_OK = pageAllowed() === true; } catch (e) { PAGE_OK = false; }
  if (!PAGE_OK) return;

  // 控制自治：同源码重入直接返回；更新源码先销毁旧实例再启动。
  var instanceWindow = pageWindow(), instanceKey = "__DSH_RO_DOJO_INSTANCE__";
  var previous = instanceWindow[instanceKey];
  if (previous && previous.source === String(dojoMain)) return;
  if (previous && isFn(previous.dispose)) previous.dispose();
  var lifecycle = { source: String(dojoMain), timer: null, listeners: [], cleanups: [], styles: [], dispose: dispose };
  instanceWindow[instanceKey] = lifecycle;

  /* ==================== 常量 ==================== */

  var VERSION        = "1.0.15";
  var API_PROTOCOL   = 1;
  var OWNER          = "ro-infinite-dojo";      // 控制权属主，全程一致
  var SCOPES         = ["dojo", "battle", "movement", "dialog", "fly"];
  var CLIENT_TAG     = "ro-infinite-dojo";
  var CFG_KEY        = "dsh-ro-dojo-standalone-v1";
  var WIN_ID         = "ro-infinite-dojo";
  var REPO_URL       = "https://github.com/Keeee1th/Lro-user-scripts";
  var CONFIG_URL     = "file:///dsh-ro-infinite-dojo.config.json";
  var FILE_HINT      = "如需读取本机文件，请在浏览器扩展详情里为本脚本开启「允许访问文件网址」";
  var NO_MOB_HINT    = "可能需要在副本内对话，请把该 NPC 名字发我";
  var LOG_MAX        = 200;
  var TICK_MS        = 250;
  var ADJ            = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
  var LEVEL_WORDS    = { basic: ["初级"], middle: ["中级"], advanced: ["高级"] };
  var REQUIRED_METHODS = [
    "snapshot", "acquire", "release", "contactNpc", "walkTo", "chooseMenu", "assistCombat",
    "setBattleTarget", "clearBattleTarget", "requestFly", "prepareCombat", "requestPickup", "teleport", "bindDialog", "nextDialog"
  ];

  /* ==================== 配置 ==================== */

  var DEFAULTS = {
    difficulty: "basic",                               // 初级 / 中级 / 高级
    stop100: true,                                     // 到顶结算后重开下一轮
    maxRound: 100,                                     // 到顶轮次
    fly: false,                                        // 无怪时飞行
    emergency: false,                                  // 危险时飞行（中高级）
    autoSignup: true,                                  // 自动报名循环
    settleEvery: 5,                                    // 每 N 轮结算一次（0 = 不按轮次结算）
    entryMap: "prontera",
    entryX: 148,
    entryY: 147,
    npcName: "荣誉管理员",                            // 报名点管理员；两种默认别名均有效，历史配置可覆盖
    entryNpcAliases: ["荣誉管理员", "荣耀管理员"],    // 报名点 NPC 别名表：任一命中即算，可被配置覆盖
    dojoNpcAliases: ["喵达人", "猫达人", "白猫", "白猫达人"],
    challengeKeywords: ["无限挑战"],
    challengeIndex: 2,
    signupKeywords: ["我要报名"],
    signupIndex: 1,
    settleKeywords: ["领取奖励", "领奖", "领取"],
    continueKeywords: ["继续挑战", "继续", "下一轮"],
    findNpcTimeoutMs: 30000,
    contactTimeoutMs: 30000,
    dialogStuckMs: 20000,
    noMobWarnMs: 20000,
    walkRetryMs: 2000,
    settleWaitMs: 60000,
    configUrl: CONFIG_URL
  };
  var CFG_KEYS = [
    "difficulty", "stop100", "maxRound", "fly", "emergency", "autoSignup", "settleEvery",
    "entryMap", "entryX", "entryY", "npcName", "entryNpcAliases", "dojoNpcAliases",
    "challengeKeywords", "challengeIndex", "signupKeywords", "signupIndex",
    "settleKeywords", "continueKeywords", "configUrl"
  ];

  var cfg = loadCfg();

  function loadCfg() {
    var c = copy(DEFAULTS);
    try {
      var raw = JSON.parse(localStorage.getItem(CFG_KEY) || "null");
      if (raw && typeof raw === "object") applyCfg(c, raw);
    } catch (e) {}
    return c;
  }
  function saveCfg() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {}
  }
  // 只接受白名单键 + 类型校验：面板与本地配置文件共用同一条入口
  function applyCfg(c, src) {
    if (!c || !src || typeof src !== "object") return c;
    for (var i = 0; i < CFG_KEYS.length; i++) {
      var k = CFG_KEYS[i];
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      var v = src[k], d = DEFAULTS[k], n = 0;
      if (Array.isArray(d)) {
        if (Array.isArray(v)) c[k] = v.map(function (x) { return String(x); }).filter(function (x) { return x !== ""; });
      } else if (typeof d === "number") {
        n = Number(v);
        if (isFinite(n)) c[k] = n;
      } else if (typeof d === "boolean") {
        if (typeof v === "boolean") c[k] = v;
      } else if (typeof d === "string") {
        if (typeof v === "string" && v) c[k] = v;
      }
    }
    if (src.npcName && !Object.prototype.hasOwnProperty.call(src, "entryNpcAliases")) c.entryNpcAliases = [c.npcName];
    if (!/^(basic|middle|advanced)$/.test(String(c.difficulty))) c.difficulty = DEFAULTS.difficulty;
    return c;
  }

  /* ==================== 运行状态 ==================== */

  var run = {
    on: false, generation: 0, timer: null,
    stage: "idle",                       // idle / entry / battle / settle / stopped
    phase: "未开始", step: "",
    statusLine: "",
    cycle: 0, round: 0, remaining: null, dist: null, challengeMap: "",
    roundActive: false, combatOn: false, rewardChosen: false, lastCompletedRound: 0,
    entry: null, npc: null, dojoNpc: null,
    lastMenuFp: "", lastNextFp: "",
    lastNotice: "", lastNoticeAt: 0,
    lastFly: 0,
    noMobSince: 0, noMobWarned: false,
    settleUntil: 0, settleSeen: false, cycleEnd: false,
    identity: "", scene: null, startedAt: 0, log: []
  };
  var mode = "none";                     // none / window / standalone
  var root = null, holder = null, wrap = null;
  var panelOpen = false;                         // 面板是否已由用户打开（拿不到助手浮窗节点时用它跟随）
  var statusEl = null, logEl = null, startBtn = null, stopBtn = null;
  var ctrls = {};

  /* ==================== 小工具 ==================== */

  function isFn(x) { return typeof x === "function"; }
  function msgOf(e) { return e && e.message ? e.message : String(e == null ? "" : e); }
  function copy(o) { var r = {}, k; for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k]; return r; }
  function nowMs() { return Date.now(); }
  function sec(n) { return (Math.round(Number(n) || 0)) + " 秒"; }

  function pageWindow() {
    try { if (typeof unsafeWindow !== "undefined" && unsafeWindow) return unsafeWindow; } catch (e) {}
    return window;
  }
  // 去掉颜色码 / 标签 / 全角数字，繁体「達/貓」归一
  function norm(s) {
    return String(s == null ? "" : s)
      .replace(/\^[0-9a-f]{6}/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 65248); })
      .replace(/達/g, "达").replace(/貓/g, "猫")
      .replace(/\s+/g, " ").trim();
  }
  // 切比雪夫距离（RO 的格子距离）
  function cheb(a, b) {
    try {
      if (!a || !b) return Infinity;
      return Math.max(Math.abs(Number(a[0]) - Number(b[0])), Math.abs(Number(a[1]) - Number(b[1])));
    } catch (e) { return Infinity; }
  }
  function mapKey(m) {
    return String(m == null ? "" : m).toLowerCase()
      .replace(/\.(gat|rsw)$/, "").replace(/\\/g, "/").replace(/^.*\//, "").trim();
  }
  function sameMap(a, b) {
    var x = mapKey(a), y = mapKey(b);
    return !!x && !!y && x === y;
  }
  function posText(p) { return (p && isFinite(Number(p[0])) && isFinite(Number(p[1]))) ? (Number(p[0]) + "," + Number(p[1])) : "?"; }
  // 走到 NPC 的相邻格：取「离玩家最近的那一格」，绝不会返回 NPC 自己那格
  function adjacentCell(pos, from) {
    if (!pos) return null;
    var cx = Math.round(Number(pos[0])), cy = Math.round(Number(pos[1]));
    if (!isFinite(cx) || !isFinite(cy)) return null;
    var best = null, bd = Infinity, i = 0;
    for (i = 0; i < ADJ.length; i++) {
      var nx = cx + ADJ[i][0], ny = cy + ADJ[i][1];
      var d = from ? cheb(from, [nx, ny]) : i;
      if (d < bd) { bd = d; best = [nx, ny]; }
    }
    return best;
  }
  // 关键词命中（子串匹配，返回命中下标数组）
  function pickIndex(items, keywords) {
    var hits = [], i = 0, k = 0, s = "";
    if (!Array.isArray(items) || !Array.isArray(keywords)) return hits;
    for (i = 0; i < items.length; i++) {
      s = norm(items[i]);
      for (k = 0; k < keywords.length; k++) {
        if (keywords[k] && s.indexOf(String(keywords[k])) >= 0) { hits.push(i); break; }
      }
    }
    return hits;
  }
  function hasWord(items, keywords) { return pickIndex(items, keywords).length > 0; }
  function levelWords(diff) { return LEVEL_WORDS[diff] || LEVEL_WORDS.basic; }

  function classifyMenu(items) {
    if (hasWord(items, cfg.challengeKeywords)) return "challenge";
    if (hasWord(items, cfg.signupKeywords)) return "signup";
    if (hasWord(items, cfg.settleKeywords)) return "settle";
    if (hasWord(items, cfg.continueKeywords)) return "continue";
    if (hasWord(items, levelWords(cfg.difficulty))) return "level";
    return "unknown";
  }
  // 本图 NPC 名单（找不到目标时打进日志，便于用户回报）
  function npcDigest(npcs) {
    var rows = (npcs || []).filter(function (n) { return n && norm(n.name); });
    if (!rows.length) return "（本图没有识别到任何 NPC）";
    var seen = {}, out = [];
    rows.forEach(function (n) {
      var k = norm(n.name);
      seen[k] = (seen[k] || 0) + 1;
    });
    for (var k2 in seen) if (Object.prototype.hasOwnProperty.call(seen, k2)) out.push(k2 + " x" + seen[k2]);
    return out.join("、") + "（共 " + rows.length + " 个）";
  }
  // 单个名字的匹配：全等或子串（保持原宽松度）
  function npcNameHit(nm, want) {
    return !!nm && !!want && (nm === want || nm.indexOf(want) >= 0);
  }
  // 在找的名字（全部别名）——日志里与「本图识别到的 NPC」成对打印
  function entryNpcNameText() {
    var al = entryNpcAliasList();
    if (!al.length) return "（别名表为空，请检查配置）";
    return "「" + al.join("」「") + "」";
  }
  // 报名点 NPC 别名表：空表 / 没配时回落到 npcName
  function entryNpcAliasList() {
    var al = cfg.entryNpcAliases;
    var byName = (Array.isArray(al) && al.length) ? al : [cfg.npcName];
    return (byName || []).map(function (x) { return norm(x).replace(/\s/g, ""); }).filter(function (x) { return !!x; });
  }
  // 按别名表找报名点 NPC；命中第 2 个起（非首选名）时把用了哪个别名记在 e.npcName 上
  function findNpc(s, name, e) {
    var al = entryNpcAliasList();
    if (name) {
      var w = norm(name).replace(/\s/g, "");
      if (w && al.indexOf(w) < 0) al = [w];        // 直传了别名表外的名字：只认这一个
    }
    if (!al.length) return null;
    var list = (s && s.npcs) || [], hits = [];
    for (var k = 0; k < al.length; k++) {
      for (var i = 0; i < list.length; i++) {
        var n = list[i];
        if (!n || !npcNameHit(norm(n.name).replace(/\s/g, ""), al[k])) continue;
        if (!hits.some(function (x) { return x.gid === n.gid; })) hits.push(n);
      }
    }
    if (e) { e.npcAmbiguous = hits.length > 1; e.npcName = hits.length === 1 ? norm(hits[0].name) : al[0]; e.npcNameIndex = 0; }
    return hits.length === 1 ? hits[0] : null;
  }
  // 报名点邻近兜底（防 NPC 以后再改名）：别名全都不命中时，
  // 取报名点周围 12 格（切比雪夫距离）内、名字含「管理员」的 NPC，只有恰好 1 个才用它
  function findEntryNpcNear(s, ex, ey) {
    var list = (s && s.npcs) || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      if (!n || !n.position) continue;
      if (norm(n.name).indexOf("管理员") < 0) continue;
      if (cheb(n.position, [ex, ey]) > 12) continue;
      out.push(n);
    }
    return out.length === 1 ? out[0] : null;
  }
  function dojoNpcList(s) {
    var al = cfg.dojoNpcAliases || [];
    return ((s && s.npcs) || []).filter(function (n) {
      var nm = norm(n.name).replace(/\s/g, "");
      for (var i = 0; i < al.length; i++) if (al[i] && nm.indexOf(String(al[i])) >= 0) return true;
      return false;
    });
  }

  /* ==================== 日志 / 状态 / 推送 ==================== */

  function logLine(text, kind) {
    var t = "[" + (run.startedAt ? ((nowMs() - run.startedAt) / 1000).toFixed(1) + "s" : "0.0s") + "] " + String(text == null ? "" : text);
    run.log.push({ text: t, kind: kind || "" });
    if (run.log.length > LOG_MAX) run.log.splice(0, run.log.length - LOG_MAX);
    paintLog();
  }
  function setPhase(phase, step) {
    run.phase = String(phase == null ? "" : phase);
    run.step = String(step == null ? "" : step);
    paintStatus();
  }
  function statusText() {
    var s = "阶段：" + (run.phase || "未开始") +
      " · 轮次：" + (run.round > 0 ? run.round : "未知") + (run.remaining == null ? "" : " / 剩余 " + run.remaining) +
      " · 距离：" + (run.dist == null ? "—" : run.dist) +
      (run.step ? " · " + run.step : "");
    run.statusLine = s;
    return s;
  }
  function paintStatus() {
    var s = statusText();
    try { if (statusEl) statusEl.textContent = s; } catch (e) {}
  }
  function paintLog() {
    try {
      if (!logEl) return;
      var rows = run.log.slice(-40).map(function (r) { return r.text; });
      logEl.textContent = rows.join("\n");
      if (logEl.scrollHeight) logEl.scrollTop = logEl.scrollHeight;
    } catch (e) {}
  }
  function pushNotice(text) {
    try {
      var a = api();
      if (a && a.notify && isFn(a.notify.push)) a.notify.push(String(text == null ? "" : text));
    } catch (e) {}
  }
  function render() {
    paintStatus();
    try {
      if (startBtn) startBtn.disabled = !!run.on;
      if (stopBtn) stopBtn.disabled = !run.on;
    } catch (e) {}
  }

  /* ==================== 助手通道（门禁照抄现实现判据） ==================== */

  function apiReport() {
    var w = pageWindow(), a = null;
    try { a = w.__DSH_RO_ASSIST_API__; } catch (e) { a = null; }
    if (!a) return { ok: false, api: null, reason: "没有找到 RO 助手（请先安装并启用助手，再进入游戏）" };
    var c = null;
    try { c = isFn(a.capabilities) ? a.capabilities() : null; } catch (e2) { return { ok: false, api: null, reason: "助手没有响应（能力自检报错）" }; }
    if (a.protocol !== API_PROTOCOL || !c || c.protocol !== API_PROTOCOL) return { ok: false, api: null, reason: "助手版本不匹配（需要协议 " + API_PROTOCOL + "）" };
    if (c.arrowRules !== true || c.battleTarget !== true) return { ok: false, api: null, reason: "助手缺少换箭或指定目标能力，请更新助手" };
    if (c.assistCombat !== true) return { ok: false, api: null, reason: "助手不支持助手代打战斗（请更新助手）" };
    if (!Array.isArray(c.modules) || c.modules.indexOf("dojo") < 0) return { ok: false, api: null, reason: "助手没有开放道场能力" };
    if (!Array.isArray(c.scopes)) return { ok: false, api: null, reason: "助手没有回报可用权限" };
    var missing = [];
    for (var i = 0; i < SCOPES.length; i++) if (c.scopes.indexOf(SCOPES[i]) < 0) missing.push(SCOPES[i]);
    if (missing.length) return { ok: false, api: null, reason: "助手缺少必需权限：" + missing.join("、") };
    var noMethod = [];
    for (var j = 0; j < REQUIRED_METHODS.length; j++) if (!isFn(a[REQUIRED_METHODS[j]])) noMethod.push(REQUIRED_METHODS[j]);
    if (noMethod.length) return { ok: false, api: null, reason: "助手缺少必需能力：" + noMethod.join("、") };
    return { ok: true, api: a, reason: "" };
  }
  function api() { return apiReport().api; }

  function call(a, name, args) {
    try { return a && isFn(a[name]) ? a[name].apply(a, args || []) : { ok: false, error: "method-missing:" + name }; }
    catch (e) { return { ok: false, error: msgOf(e) }; }
  }
  // 传送：按约定的新方法调用；助手侧还没实现时明确上报，不空转
  function doTeleport(a, map, x, y) {
    if (!isFn(a.teleport)) return { ok: false, error: "teleport-missing" };
    var r = call(a, "teleport", [OWNER, { map: map, x: x, y: y }]);
    if (!r || r.ok !== true) return { ok: false, error: (r && r.error) || "teleport-failed" };
    return { ok: true };
  }

  /* ==================== 对话窗口（下一步） ==================== */

  function dialogOpen(s) { return !!(s && (s.dialog ? s.dialog.open : s.dialogOpen)); }
  function bindVisibleDialog(a, s, v) {
    var expected = run.stage === "entry" ? run.entry && run.entry.gid : 0;
    if (run.stage !== "entry") {
      var candidates = dojoNpcList(s);
      for (var i = 0; i < candidates.length; i++) if (candidates[i].gid === v.naid) expected = v.naid;
    }
    if (!v.naid || !expected || v.naid !== expected) {
      doStop("对话来自其他 NPC 或归属未确认（NAID " + (v.naid || "?") + "），已停手", "foreign-npc");
      return false;
    }
    var r = call(a, "bindDialog", [OWNER, { naid: v.naid, fingerprint: v.fingerprint }]);
    if (!r || r.ok !== true) { doStop("现场对话绑定被拒绝（" + ((r && r.error) || "unknown") + "）", "dialog-bind-failed"); return false; }
    return true;
  }
  function chooseBoundMenu(a, m, idx) {
    var s = call(a, "snapshot", [OWNER]);
    if (!s || !bindVisibleDialog(a, s, m)) return { ok: false, error: "dialog-bind-failed" };
    return call(a, "chooseMenu", [OWNER, { naid: m.naid, index: idx, fingerprint: m.fingerprint }]);
  }
  // 下一页仅消费助手当前可见对话；本脚本不读取游戏组件。
  function pressNext(a, s, now, tag) {
    var e = run.stage === "entry" ? run.entry : null;
    var d = s && s.dialog;
    if (!d || !d.open || !d.fingerprint || !d.naid) {
      if (!run.noNextSince) run.noNextSince = now;
      if (now - run.noNextSince >= cfg.dialogStuckMs) return doStop("助手未提供当前可见对话（dialog-snapshot-missing），请手动确认", "dialog-snapshot-missing");
      setPhase("等待对话内容（" + (tag || "对话") + "）", "");
      return;
    }
    if (!bindVisibleDialog(a, s, d)) return;
    if (!d.nextAvailable) {
      if (!run.noNextSince) run.noNextSince = now;
      else if (now - run.noNextSince >= cfg.dialogStuckMs) return doStop("对话停在没有「下一步」的一层（dialog-stuck），请手动点一下", "dialog-stuck");
      setPhase(/报名成功|报名完成/.test(d.text || "") ? "已报名，等待传送" : "对话文字层已结束", "");
      return;
    }
    run.noNextSince = 0;
    var fp = d.naid + "|" + d.fingerprint;
    if (fp === run.lastNextFp) {
      if (e) {
        if (!e.stuckSince) e.stuckSince = now;
        else if (now - e.stuckSince >= cfg.dialogStuckMs) return doStop("同一句对话停住不动了（dialog-stuck），请手动点一下", "dialog-stuck");
      }
      setPhase("「下一步」已点过，等对话推进", "");
      return;
    }
    var r = call(a, "nextDialog", [OWNER, { naid: d.naid, fingerprint: d.fingerprint }]);
    if (!r || r.ok !== true) return doStop("下一页被拒绝（" + ((r && r.error) || "unknown") + "）", "dialog-next-failed");
    if (e) e.stuckSince = 0;
    run.lastNextFp = fp;
    logLine("点「下一步」" + (d.text ? "（" + norm(d.text).slice(0, 28) + "）" : ""));
    if (e && /报名成功|报名完成/.test(d.text || "")) {
      e.signedUp = true; e.expect = "goto"; e.gotoAt = now;
      logLine("报名成功，等待传送到道场");
    }
  }

  /* ==================== 启动 / 停止 ==================== */

  function acquireReason(r) {
    var e = r && r.error;
    if (e === "owned") return "助手正被其他流程占用（控制权被占），请先停掉那个流程";
    if (e === "assistant-busy") return "助手挂机正在运行，请先停止助手挂机再点开始";
    if (e === "client-not-ready") return "还没进游戏（请先登录角色并站到地面）";
    if (e === "invalid-owner-or-scopes") return "申请参数不被助手接受（请更新本脚本或助手）";
    return "助手拒绝交出控制权（" + (e || "未知原因") + "）";
  }
  // V1.0.2：助手换箭自查（只读：只读一次状态快照，不发任何指令），供用户确认助手自己能不能换箭
  function arrowPreflight(s) {
    var ar = (s && s.arrow) || null;
    var out = { ok: !!ar, enabled: false, defaultArrow: null, currentArrow: null, ready: false, blocked: false, text: "" };
    if (ar) {
      out.enabled = ar.enabled === true;
      out.defaultArrow = (ar.defaultItid == null ? null : Number(ar.defaultItid));
      out.currentArrow = (ar.currentItid == null ? null : Number(ar.currentItid));
      out.ready = ar.ready === true;
      out.blocked = ar.blocked === true;
    }
    function field(k) { return ar && Object.prototype.hasOwnProperty.call(ar, k) ? JSON.stringify(ar[k]) : "字段未提供"; }
    out.text = "助手换箭预检：enabled=" + (ar ? String(out.enabled) : "字段未提供") +
      " masterEnabled=" + field("masterEnabled") + " selectEnabled=" + field("selectEnabled") +
      " configuredByElem=" + field("configuredByElem") + " configuredByMid=" + field("configuredByMid") +
      " profileKey=" + field("profileKey") + " profileTrusted=" + field("profileTrusted") +
      " identity=" + (s && s.identity ? JSON.stringify(s.identity) : "字段未提供") +
      " evaluated=" + field("evaluated") +
      " 默认箭=" + (out.defaultArrow == null ? "未设" : out.defaultArrow) +
      " 当前箭=" + (out.currentArrow == null ? "未装备" : out.currentArrow) +
      " ready=" + (out.ready ? "true" : "false") + " blocked=" + (out.blocked ? "true" : "false") +
      (ar && !ar.target ? "（无目标，不作换箭成败判定）" : "");
    return out;
  }
  function identityKey(s) {
    var id = s && s.identity;
    return id && id.oneId != null && String(id.oneId) !== "" && String(id.oneId) !== "0" && id.epoch != null ? JSON.stringify([String(id.oneId), id.epoch]) : "";
  }
  function dojoEvidence(s) {
    var id = identityKey(s), d = s && s.dojo, m = s && s.menu;
    if (!id || !mapKey(s.map)) return null;
    if (d && d.confirmed === true && sameMap(d.map, s.map)) return d;
    var ownedMenu = dialogOpen(s) && m && m.naid && m.fingerprint && Array.isArray(m.items) &&
      dojoNpcList(s).some(function (n) { return n.gid === m.naid; });
    var kind = ownedMenu ? classifyMenu(m.items) : "unknown";
    if (kind === "settle" || kind === "continue") return { confirmed: true, map: s.map, phase: "settle", round: null, remaining: null, source: "visible-dojo-npc-menu" };
    var old = run.scene;
    if (old && old.identity === id && sameMap(old.map, s.map)) {
      return { confirmed: true, map: s.map, phase: old.phase === "active" && (s.mobs || []).some(function (x) { return x && !x.dead && x.mid && x.gid; }) ? "active" : "idle", round: old.round, remaining: old.remaining, source: "same-identity-map-observation" };
    }
    return null;
  }
  // 仅本轮已受理入场可换代；同图重登与未知落图不得借同角色放宽。
  function acceptEntryEpoch(a, s) {
    var e = run.stage === "entry" && run.entry, old = run.identity && JSON.parse(run.identity);
    if (!old || String(s.identity.oneId) !== old[0] || s.identity.epoch !== old[1] + 1) return false;
    var exited = (run.stage === "battle" || run.stage === "settle") && run.cycleEnd && run.rewardChosen && sameMap(s.map, cfg.entryMap) && !sameMap(s.map, run.challengeMap) && run.scene && run.scene.identity === run.identity && sameMap(run.scene.map, run.challengeMap);
    if (!exited && (!e || sameMap(e.map, s.map))) return false;
    var landed = e && !e.signedUp && e.tpAt && sameMap(s.map, cfg.entryMap);
    var scene = dojoEvidence(s);
    var entered = e && e.signedUp && e.gid && !sameMap(s.map, cfg.entryMap) && scene && /^(active|idle|settle)$/.test(scene.phase);
    if (!landed && !entered && !exited) return false;
    var released = call(a, "release", [OWNER]);
    var acquired = released && released.ok === true && call(a, "acquire", [OWNER, SCOPES.slice()]);
    if (!acquired || acquired.ok !== true) return false;
    run.identity = identityKey(s);
    run.scene = null; run.lastMenuFp = ""; run.lastNextFp = ""; run.noNextSince = 0;
    if (e) { e.map = s.map; e.gid = 0; e.tpAt = 0; e.tpCount = 0; }
    prepareCombat(a);
    logLine("本轮入场换图已确认，旧现场与对话绑定已清理");
    return true;
  }
  function rememberScene(s, d) {
    run.scene = { identity: identityKey(s), map: s.map, phase: d.phase, round: d.round == null ? null : d.round, remaining: d.remaining == null ? null : d.remaining, source: d.source };
  }
  function applyDojoScene(a, s, d, now) {
    if (!d) return;
    var round = d.round == null ? null : Number(d.round);
    if (round != null && isFinite(round) && round > 0) run.round = round;
    if (d.remaining != null && isFinite(Number(d.remaining))) run.remaining = Number(d.remaining);
    if (d.phase === "active" && (round == null || round > run.lastCompletedRound)) {
      if (!run.roundActive) call(a, "requestPickup", [OWNER, { on: true, types: [4, 5, 6] }]);
      run.roundActive = true;
    } else if (d.phase === "idle" || d.phase === "settle") {
      if (run.combatOn) call(a, "assistCombat", [OWNER, false]);
      if (run.roundActive) call(a, "requestPickup", [OWNER, { on: false }]);
      run.roundActive = false; run.combatOn = false;
      if (d.phase === "settle" && run.stage === "battle" && !run.settleSeen) {
        run.cycleEnd = !!(cfg.stop100 && run.round >= cfg.maxRound);
        beginSettle(now, "当前现场已确认结算");
      }
    }
    rememberScene(s, d);
  }
  function prepareCombat(a) {
    var prep = call(a, "prepareCombat", [OWNER, { clearLocks: true, allMobs: true }]);
    if (!prep || prep.ok !== true) {
      logLine("战斗准备未完成（" + ((prep && prep.error) || "unknown") + "），仍继续运行", "warn");
    } else {
      logLine("战斗准备完成：清空锁定名单 " + prep.cleared + " 条，改为攻击全部怪（原值 " + (prep.allMobsRestore ? "开" : "关") + "）");
    }
  }
  function doStart() {
    if (run.on) return;
    var rep = apiReport();
    if (!rep.ok) return doStop(rep.reason, "api-missing");
    var a = rep.api;
    var r = call(a, "acquire", [OWNER, SCOPES.slice()]);
    if (!r || r.ok !== true) return doStop(acquireReason(r), "acquire-refused");
    var s = null;
    try { s = a.snapshot(OWNER); } catch (e) { s = null; }
    if (!s) return doStop("拿到控制权却读不到游戏状态（snapshot-missing），请重开页面再试", "snapshot-missing");
    if (!s.ready) return doStop("游戏未就绪（可能还在登录或已掉线），请进游戏后再点开始", "client-not-ready");
    var identity = identityKey(s);
    if (!identity || !mapKey(s.map)) return doStop("当前角色或地图身份未确认，不传送也不接续", "identity-map-missing");
    if (run.scene && (run.scene.identity !== identity || !sameMap(run.scene.map, s.map))) run.scene = null;
    var scene = dojoEvidence(s);
    if (!sameMap(s.map, cfg.entryMap) && !scene && (s.inDojoMap || dojoNpcList(s).length)) return doStop("当前现场无法确证为本角色道场，不报名或开战", "dojo-unconfirmed");
    run.identity = identity;
    run.on = true;
    run.generation++;
    run.startedAt = nowMs();
    run.log = [];
    logLine("已拿到控制权，开始运行（" + VERSION + "）");
    var pf = arrowPreflight(s);
    run.preflight = pf;
    logLine(pf.text);
    // 拿到新租约后准备战斗；每轮 entry 不重复调用。
    prepareCombat(a);
    if (scene && !sameMap(s.map, cfg.entryMap)) {
      resetCycle(1);
      beginBattle(s, nowMs());
      applyDojoScene(a, s, scene, nowMs());
      if (/^(active|idle|settle)$/.test(scene.phase)) logLine("已从当前道场现场接续（" + scene.phase + "，来源 " + (scene.source || "助手当前现场") + "）");
      else logLine("当前场内地图已确认，但阶段未知；保持现场等待，不宣称战斗或结算已恢复", "warn");
    } else beginEntry(1);
    run.timer = setInterval(function () { tick(run.generation); }, TICK_MS);
    render();
    tick(run.generation);
  }
  // 所有停止原因必须同时出现在状态行与日志
  function doStop(reason, code) {
    reason = String(reason == null || reason === "" ? "已停止" : reason);
    var wasOn = run.on;
    run.on = false;
    run.generation++;
    if (run.timer) { try { clearInterval(run.timer); } catch (e) {} run.timer = null; }
    var a = api();
    if (a) {
      call(a, "requestPickup", [OWNER, { on: false }]);
      call(a, "clearBattleTarget", [OWNER]);
      call(a, "release", [OWNER]);
    }
    run.stage = "stopped";
    run.entry = null; run.roundActive = false; run.combatOn = false;
    run.lastMenuFp = ""; run.lastNextFp = ""; run.noNextSince = 0;
    run.npc = null;
    run.dojoNpc = null;
    run.settleUntil = 0;
    setPhase("已停止：" + reason + (code ? "（" + code + "）" : ""), run.cycle ? "第 " + run.cycle + " 轮循环" : "");
    logLine("停止：" + reason + (code ? "（" + code + "）" : ""), "err");
    if (wasOn) pushNotice("无限挑战已停止：" + reason);
    render();
    return reason;
  }

  /* ==================== 主循环 ==================== */

  function tick(gen) {
    if (!run.on || gen !== run.generation) return;
    try { tickBody(); }
    catch (e) { doStop("运行出错：" + msgOf(e), "runtime-error"); }
  }
  function tickBody() {
    var a = api();
    if (!a) return doStop("助手通道没了（可能被停用或页面刷新），请重新点开始", "api-lost");
    var s = null;
    try { s = a.snapshot(OWNER); } catch (e) { s = null; }
    if (!s) return doStop("控制权已不在本脚本手里（lease-lost），请重新点开始", "lease-lost");
    if (!s.ready) return doStop("游戏未就绪（可能掉线或还在登录）", "client-not-ready");
    var now = nowMs();
    var identity = identityKey(s);
    if (!identity || !mapKey(s.map) || (identity !== run.identity && !acceptEntryEpoch(a, s))) { run.scene = null; return doStop("角色或地图身份已变化，不沿用旧现场", "identity-changed"); }
    if (run.stage === "battle" || run.stage === "settle") {
      if (!sameMap(s.map, run.challengeMap) && !run.rewardChosen) { run.scene = null; return doStop("已离开确证的道场地图，不沿用旧现场", "dojo-map-changed"); }
      var d = s.dojo;
      if (d && d.confirmed === true && sameMap(d.map, s.map)) applyDojoScene(a, s, d, now);
    }
    if (run.stage === "battle") return battleTick(a, s, now);
    if (run.stage === "settle") return settleTick(a, s, now);
    return entryTick(a, s, now);
  }

  function resetCycle(cycle) {
    run.cycle = cycle;
    run.entry = null;
    run.scene = null;
    run.round = 0;
    run.remaining = null;
    run.challengeMap = "";
    run.rewardChosen = false; run.lastCompletedRound = 0;
    run.roundActive = false; run.combatOn = false;
    run.dist = null;
    run.lastMenuFp = "";
    run.lastNextFp = "";
    run.lastNotice = "";
    run.lastNoticeAt = 0;
    run.lastFly = 0;
    run.noMobSince = 0;
    run.noMobWarned = false;
    run.settleUntil = 0;
    run.settleSeen = false;
    run.cycleEnd = false;
    run.noNextSince = 0;
    run.npc = null;
    run.dojoNpc = null;
  }
  function beginEntry(cycle) {
    resetCycle(cycle);
    run.stage = "entry";
    run.entry = {
      map: "", startedAt: nowMs(), expect: "next-intro", picks: 0, signedUp: false, gotoAt: 0, gotoRetries: 0, tpAt: 0, tpCount: 0, tpErr: "",
      gid: 0, walkAt: 0, walkTries: 0, walkTarget: null, walkIssuedAt: 0, walkWarned: false,
      arrivedLogged: false, contactAt: 0, firstContactAt: 0, contactErr: "", failStreak: 0,
      dialogSeenAt: 0, stuckSince: 0, menuWaitAt: 0
    };
    setPhase("准备报名（第 " + cycle + " 轮循环）", "走向报名点");
    logLine("===== 第 " + cycle + " 轮循环：开始自动报名 =====");
  }

  /* ==================== 入口（全自动报名） ==================== */

  function entryTick(a, s, now) {
    var e = run.entry;
    if (!e) { beginEntry(run.cycle + 1); e = run.entry; }
    if (!e.map) e.map = s.map;

    // 已报名 → 等地图变化进道场
    if (e.signedUp) {
      if (s.map && !sameMap(s.map, cfg.entryMap)) {
        var scene = dojoEvidence(s);
        if (!scene) { run.scene = null; return doStop("报名后落图尚无当前道场确证，不猜地图或轮次", "dojo-unconfirmed"); }
        beginBattle(s, now);
        applyDojoScene(a, s, scene, now);
        return;
      }
      if (dialogOpen(s)) return dialogTick(a, s, now);
      if (!run.on) return;
      if (now - (e.gotoAt || now) > 15000) {
        e.gotoRetries++;
        if (e.gotoRetries > 3) return doStop("报名后一直没有进入道场（goto-timeout），请手动进一次道场", "goto-timeout");
        e.gotoAt = now;
        logLine("报名后还没进道场，重新点一次「下一步」（第 " + e.gotoRetries + " 次）", "warn");
      }
      setPhase("报名成功，等待传送到道场", "第 " + e.gotoRetries + " 次等待");
      return;
    }

    // 同报名地图直接识别实际 NPC；仅跨图使用原合法传送与重试。
    var atEntry = sameMap(s.map, cfg.entryMap);
    if (!atEntry && !e.tpAt) {
      var t0 = doTeleport(a, cfg.entryMap, cfg.entryX, cfg.entryY);
      if (!t0.ok) e.tpErr = t0.error;
      if (!t0.ok && t0.error === "teleport-missing") {
        return doStop("助手暂未提供传送能力（请更新助手）", "teleport-unsupported");
      }
      if (!t0.ok) return doStop("传送到报名点失败（" + t0.error + "）", "teleport-failed");
      e.tpAt = now; e.tpCount = 1;
      setPhase("传送到报名点", cfg.entryMap + " " + cfg.entryX + "," + cfg.entryY);
      return;
    }
    if (!atEntry) {
      if (now - e.tpAt < 8000) {
        setPhase("传送到报名点", "等待落地 " + sec((now - e.tpAt) / 1000));
        return;
      }
      if (e.tpCount >= 2) {
        return doStop("传送到报名点后 8 秒内仍未到位，当前在 " + (s.map || "?") + " " + posText(s.player && s.player.position) + (e.tpErr ? "（助手返回：" + e.tpErr + "）" : ""), "teleport-timeout");
      }
      var t1 = doTeleport(a, cfg.entryMap, cfg.entryX, cfg.entryY);
      if (!t1.ok) e.tpErr = t1.error;
      if (!t1.ok && t1.error === "teleport-missing") {
        return doStop("助手暂未提供传送能力（请更新助手）", "teleport-unsupported");
      }
      if (!t1.ok) return doStop("传送到报名点失败（" + t1.error + "）", "teleport-failed");
      e.tpAt = now; e.tpCount++;
      logLine("8 秒还没到报名点，补发一次传送（第 " + e.tpCount + " 次）", "warn");
      setPhase("传送到报名点", cfg.entryMap + " " + cfg.entryX + "," + cfg.entryY);
      return;
    }

    var p = s.player && s.player.position;

    // 找入口 NPC：先按别名表匹配；全不命中才走报名点邻近兜底
    e.npcNameText = entryNpcNameText();
    var npc = findNpc(s, null, e);
    if (!npc && !e.npcAmbiguous) {
      npc = findEntryNpcNear(s, cfg.entryX, cfg.entryY);
      if (npc) logLine("按报名点邻近兜底选中了 " + norm(npc.name) + "（12 格内只有这一个「管理员」）", "warn");
    }
    if (e.npcAmbiguous) {
      if (now - e.startedAt >= cfg.findNpcTimeoutMs) return doStop("报名点识别到多个候选 NPC，无法确定该找哪一个（npc-ambiguous）", "npc-ambiguous");
      setPhase("报名点 NPC 不唯一，请手动确认", "");
      return;
    }
    if (npc && e.npcNameIndex > 0) logLine("别名命中：「" + norm(npc.name) + "」（别名表第 " + (e.npcNameIndex + 1) + " 项）");
    if (!npc) {
      if (now - e.startedAt >= cfg.findNpcTimeoutMs) {
        logLine("在找的名字（全部别名）：" + e.npcNameText, "warn");
        logLine("本图识别到的 NPC：" + npcDigest(s.npcs), "warn");
        return doStop("在 " + cfg.entryMap + " " + cfg.entryX + "," + cfg.entryY + " 附近找不到" + e.npcNameText + "（npc-not-found）", "npc-not-found");
      }
      run.dist = null;
      setPhase("寻找" + e.npcNameText, "已等 " + sec((now - e.startedAt) / 1000));
      return;
    }
    if (e.gid !== npc.gid) {
      e.gid = npc.gid; e.walkAt = 0; e.walkTries = 0; e.walkTarget = null;
      e.contactAt = 0; e.firstContactAt = 0; e.contactErr = ""; e.failStreak = 0; e.arrivedLogged = false; e.walkWarned = false;
    }
    if (dialogOpen(s)) return dialogTick(a, s, now);
    var d = cheb(p, npc.position);
    run.dist = isFinite(d) ? d : null;

    // 本服扫描到正确 NPC 即可 CONTACT；距离仅展示，不走位。
    // 接触
    setPhase("接触「" + e.npcName + "」", "距离 " + d);
    if (!e.firstContactAt) e.firstContactAt = now;
    if (now - e.contactAt >= 1000) {
      e.contactAt = now;
      var cr = call(a, "contactNpc", [OWNER, npc.gid]);
      if (!cr || cr.ok !== true) {
        e.contactErr = (cr && cr.error) || "unknown";
        e.failStreak++;
        logLine("接触「" + e.npcName + "」失败：" + e.contactErr + "（连续 " + e.failStreak + " 次）｜在找的名字（全部别名）：" + e.npcNameText, "warn");
        if (e.failStreak === 3) logLine("连续 3 次点不开对话，先核对坐标与 NPC 名字；在找的名字（全部别名）：" + e.npcNameText + "；本图识别到的 NPC：" + npcDigest(s.npcs), "warn");
      } else {
        if (e.failStreak) logLine("接触已恢复");
        e.contactErr = "";
        e.failStreak = 0;
      }
    }
    if (dialogOpen(s)) {
      e.contactErr = "";
      e.failStreak = 0;
      return dialogTick(a, s, now);
    }
    if (now - e.firstContactAt >= cfg.contactTimeoutMs) {
      logLine("在找的名字（全部别名）：" + e.npcNameText, "warn");
      logLine("本图识别到的 NPC：" + npcDigest(s.npcs), "warn");
      return doStop("点不开「" + e.npcName + "」的对话（contact-failed" + (e.contactErr ? "：" + e.contactErr : "") + "）", "contact-failed");
    }
  }

  function dialogTick(a, s, now) {
    var e = run.entry;
    if (!e.dialogSeenAt) { e.dialogSeenAt = now; logLine("对话已打开，开始按流程选择"); }
    var m = (s.menu && Array.isArray(s.menu.items) && s.menu.items.length) ? s.menu : null;

    if (m) {
      if (m.naid && e.gid && m.naid !== e.gid) return doStop("对话来自其他 NPC（NAID " + m.naid + "），已停手", "foreign-npc");
      if (m.fingerprint && m.fingerprint === run.lastMenuFp) {
        setPhase("菜单已选过，等服务器回应", "");
        return;
      }
      return chooseEntryMenu(a, m, now);
    }
    e.menuWaitAt = 0;
    pressNext(a, s, now, "报名");
  }

  function chooseEntryMenu(a, m, now) {
    var e = run.entry;
    var items = m.items.slice();
    var kind = classifyMenu(items);
    var CH = { key: cfg.challengeKeywords, index: cfg.challengeIndex, label: "无限挑战", role: "challenge" };
    var SG = { key: cfg.signupKeywords, index: cfg.signupIndex, label: "我要报名", role: "signup" };
    var plan = null;
    if (kind === "challenge") plan = CH;
    else if (kind === "signup") plan = SG;
    else if (kind === "level") plan = { key: levelWords(cfg.difficulty), index: 0, label: "难度", role: "level" };
    else if (kind === "settle") plan = { key: cfg.settleKeywords, index: 0, label: "领奖", role: "settle" };
    else if (e.expect === "menu-challenge") plan = CH;      // 第一个菜单：按无限挑战的规则
    else if (e.expect === "menu-signup") plan = SG;         // 第二个菜单：按我要报名的规则
    else if (e.picks === 0) plan = CH;                      // 兜底：链上第一个菜单
    else if (e.picks === 1) plan = SG;                      // 兜底：链上第二个菜单
    if (!plan) {
      logLine("不认识的菜单：" + items.join(" / "), "warn");
      return doStop("菜单不认识，请把这条对话发我（invalid-menu）：" + items.join(" / "), "invalid-menu");
    }
    if (!m.naid) {
      if (!e.menuWaitAt) e.menuWaitAt = now;
      if (now - e.menuWaitAt > 3000) return doStop("菜单缺少必要的对话标识（invalid-menu）：" + items.join(" / "), "invalid-menu");
      setPhase("菜单缺少对话标识，等一帧", "");
      return;
    }
    e.menuWaitAt = 0;
    var hits = pickIndex(items, plan.key);
    var idx = -1, via = "";
    if (hits.length === 1) { idx = hits[0]; via = "关键词"; }
    else if (hits.length > 1) {
      return doStop("「" + plan.label + "」命中多项，已停手，请手动选择（invalid-menu）：" + hits.map(function (i) { return items[i]; }).join(" / "), "invalid-menu");
    } else if (plan.index >= 1 && plan.index <= items.length) {
      idx = plan.index - 1;
      via = "序号 " + plan.index;
      logLine("没匹配到关键词，按序号兜底选第 " + plan.index + " 项：" + items[idx], "warn");
    } else {
      return doStop("菜单里没有「" + plan.label + "」可用项（invalid-menu）：" + items.join(" / "), "invalid-menu");
    }
    var r = chooseBoundMenu(a, m, idx);
    if (!r || r.ok !== true) {
      if (r && r.error === "menu-already-used") { run.lastMenuFp = m.fingerprint; return; }
      logLine("选择被拒绝：" + ((r && r.error) || "unknown"), "warn");
      return doStop("菜单提交失败（" + ((r && r.error) || "unknown") + "）", "choose-failed");
    }
    run.lastMenuFp = m.fingerprint;
    run.lastNextFp = "";
    run.noNextSince = 0;
    e.stuckSince = 0;
    logLine("已选" + via + "：" + items[idx] + "（NAID " + m.naid + "）");
    e.picks++;
    if (plan.role === "challenge") {
      e.expect = "menu-signup";
    } else if (plan.role === "signup") {
      e.signedUp = true; e.expect = "goto"; e.gotoAt = now;
      logLine("已报名，等待传送到道场");
    }
  }

  // 入图与结算后先等本轮出怪；拾取可能驱动走位，只有服务器确认出怪才允许打开。
  function enterBattleStage() {
    run.stage = "battle";
    run.noMobSince = 0;
  }
  function beginBattle(s, now) {
    run.entry = null;
    run.challengeMap = String((s && s.map) || ""); // 报名后实际进入的地图为准，不猜地图名关键词
    run.roundActive = false; run.combatOn = false; // 入图不等于出怪；只有服务器本轮开始提示才允许打
    enterBattleStage();
    run.noMobWarned = false;
    run.lastMenuFp = "";
    run.lastNextFp = "";
    run.dojoNpc = null;
    run.npc = null;
    run.noNextSince = 0;
    setPhase("已进入无限挑战", "等待本轮出怪公告");
    logLine("已进入无限挑战（地图 " + ((s && s.map) || "?") + "），等待出怪公告后再战斗");
  }

  /* ==================== 战斗循环 ==================== */

  function battleTick(a, s, now) {
    var m = (dialogOpen(s) && s.menu && Array.isArray(s.menu.items) && s.menu.items.length) ? s.menu : null;
    if (m) return dojoMenuTick(a, s, m, now);
    if (dialogOpen(s)) return pressNext(a, s, now, "副本内对话");
    if (run.rewardChosen) {
      if (s.map && !sameMap(s.map, run.challengeMap)) return doStop("已领取阶段奖励并离开挑战地图，请手动确认后再入场", "reward-exit");
      setPhase("已提交阶段领奖", "等待服务器确认离开副本");
      return;
    }
    if (!run.challengeMap || !sameMap(s.map, run.challengeMap)) { setPhase("已离开报名后的挑战地图", "不启动战斗，等待地图核对"); return; }
    if (!run.roundActive) {
      if (dojoNpcList(s).length) return dojoNpcTick(a, s, now);
      setPhase("等待本轮出怪提示", "不寻怪、不发战斗动作");
      return;
    }

    var live = (s.mobs || []).filter(function (x) { return x && !x.dead && x.mid && x.gid; });
    var t = live.filter(function (x) { return x.isBoss; })[0] || live[0];
    if (t) {
      run.dist = t.position ? (isFinite(cheb(s.player && s.player.position, t.position)) ? cheb(s.player && s.player.position, t.position) : null) : null;
      run.dojoNpc = null;
      run.noMobSince = 0;
      run.noMobWarned = false;
      // V1.0.2：有活怪一律指定目标开战（不再按 BOSS/普通分流，也不再等换箭）；换箭由助手精灵自己接管，代打一律 true
      call(a, "setBattleTarget", [OWNER, { mid: t.mid, gid: t.gid }]);
      var rb = call(a, "assistCombat", [OWNER, true]);
      if (!rb || rb.ok !== true) {
        var rwhy = (rb && (rb.error || rb.result)) || "unknown";
        setPhase("开战失败：" + rwhy, "目标 #" + t.mid);
        logLine("请求开战失败（battle-request-failed）：" + rwhy, "warn");
        return doStop("请求开战失败（battle-request-failed：" + rwhy + "）", "battle-request-failed");
      }
      run.combatOn = true;
      setPhase("战斗中", "目标 " + (t.isBoss ? "首领" : "普通") + " #" + t.mid);
      if (cfg.emergency && cfg.difficulty !== "basic" && s.player && s.player.maxHp > 0 && s.player.hp / s.player.maxHp < 0.7 && now - run.lastFly > 3000) {
        run.lastFly = now;
        call(a, "requestFly", [OWNER, { reason: "道场低血量" }]);
        logLine("血量偏低，已请求飞行");
      }
      return;
    }

    // 暂无怪：立即收起普通战斗；保护状态不归本脚本终止。
    if (run.combatOn) { call(a, "assistCombat", [OWNER, false]); run.combatOn = false; }
    call(a, "clearBattleTarget", [OWNER]);
    if (!run.noMobSince) {
      run.noMobSince = now;
      logLine("本图暂时没有怪");
    }
    if (cfg.fly && sameMap(s.map, run.challengeMap) && run.remaining > 0 && now - run.lastFly > 3000) {
      run.lastFly = now;
      call(a, "requestFly", [OWNER, { reason: "道场无怪且仍有剩余" }]);
      logLine("无怪且仍有剩余，已请求飞行");
    }
    // 无怪不代表轮次结束：不凭等待时长领奖或开下一轮。
    if (run.remaining === 0) dojoNpcTick(a, s, now);
    else setPhase("等待本轮剩余怪物或结束公告", "不推断结算");
  }

  function dojoNpcTick(a, s, now) {
    var list = dojoNpcList(s);
    var waited = run.noMobSince ? (now - run.noMobSince) / 1000 : 0;
    if (!list.length) {
      if (now - run.noMobSince >= cfg.noMobWarnMs && !run.noMobWarned) {
        run.noMobWarned = true;
        logLine("本图识别到的 NPC：" + npcDigest(s.npcs), "warn");
        logLine(NO_MOB_HINT, "warn");
        pushNotice("无限挑战：" + NO_MOB_HINT);
      }
      setPhase("道场内没有目标", "无怪 " + sec(waited));
      return;
    }
    var n = run.dojoNpc;
    if (!n || (list.length === 1 ? n.gid !== list[0].gid : n.gid !== 0)) {
      run.dojoNpc = { gid: list.length === 1 ? list[0].gid : 0, first: now, walkAt: 0, tries: 0, contactAt: 0, failStreak: 0 };
      n = run.dojoNpc;
    }
    if (list.length > 1) {
      setPhase("副本内 NPC 不唯一，请手动确认", "");
      if (now - n.first >= cfg.findNpcTimeoutMs) {
        logLine("本图识别到的 NPC：" + npcDigest(s.npcs), "warn");
        return doStop("副本内识别到多个候选 NPC，无法确定该找哪一个（npc-ambiguous）", "npc-ambiguous");
      }
      return;
    }
    var npc = list[0];
    var nm = norm(npc.name) || "?";
    var d = cheb(s.player && s.player.position, npc.position);
    run.dist = isFinite(d) ? d : null;
    // 本服扫描范围即对话范围；无坐标、同格或邻格不可走均不阻塞 CONTACT。
    setPhase("接触副本内 NPC「" + nm + "」", "距离 " + d);
    if (now - n.contactAt >= 1000) {
      n.contactAt = now;
      var cr = call(a, "contactNpc", [OWNER, npc.gid]);
      if (!cr || cr.ok !== true) {
        n.failStreak++;
        logLine("接触副本内 NPC「" + nm + "」失败：" + ((cr && cr.error) || "unknown") + "（连续 " + n.failStreak + " 次）", "warn");
      } else n.failStreak = 0;
    }
    if (!dialogOpen(s) && now - n.first >= cfg.contactTimeoutMs) {
      logLine("本图识别到的 NPC：" + npcDigest(s.npcs), "warn");
      return doStop("点不开副本内 NPC「" + nm + "」的对话（contact-failed）", "contact-failed");
    }
  }

  function dojoMenuTick(a, s, m, now) {
    if (m.fingerprint && m.fingerprint === run.lastMenuFp) {
      setPhase("菜单已选过，等服务器回应", "");
      return;
    }
    var items = m.items.slice();
    var kind = classifyMenu(items);
    if (kind === "settle" || kind === "continue") return settlePick(a, items, m, now);
    var plan = null;
    if (kind === "level") plan = { key: levelWords(cfg.difficulty), label: "难度" };
    else if (kind === "challenge") plan = { key: cfg.challengeKeywords, index: cfg.challengeIndex, label: "无限挑战" };
    else if (kind === "signup") plan = { key: cfg.signupKeywords, index: cfg.signupIndex, label: "我要报名" };
    if (!plan) {
      logLine("道场内出现不认识的菜单：" + items.join(" / "), "warn");
      return doStop("道场内出现不认识的菜单，已停手（invalid-menu）：" + items.join(" / "), "invalid-menu");
    }
    var hits = pickIndex(items, plan.key);
    var idx = -1, via = "";
    if (hits.length === 1) { idx = hits[0]; via = "关键词"; }
    else if (hits.length > 1) return doStop("「" + plan.label + "」命中多项，已停手，请手动选择（invalid-menu）：" + items.join(" / "), "invalid-menu");
    else if (plan.index >= 1 && plan.index <= items.length) { idx = plan.index - 1; via = "序号 " + plan.index; }
    else return doStop("菜单里没有「" + plan.label + "」可用项（invalid-menu）：" + items.join(" / "), "invalid-menu");
    var r = chooseBoundMenu(a, m, idx);
    run.lastMenuFp = m.fingerprint;
    if (!r || r.ok !== true) {
      if (r && r.error === "menu-already-used") return;
      return doStop("菜单提交失败（" + ((r && r.error) || "unknown") + "）", "choose-failed");
    }
    run.lastNextFp = "";
    logLine("道场内已选" + via + "：" + items[idx]);
  }

  /* ==================== 结算 ==================== */

  function beginSettle(now, why) {
    if (run.stage !== "battle") return; // V2.38.13 FIX-9：删掉恒假的第二项（语义=只允许从战斗阶段进入结算）
    run.roundActive = false;
    if (run.combatOn) { call(api(), "assistCombat", [OWNER, false]); run.combatOn = false; }
    call(api(), "requestPickup", [OWNER, { on: false }]); // V1.0.2：结算阶段收起自动拾取
    run.dojoNpc = null;
    run.stage = "settle";
    run.settleUntil = now + cfg.settleWaitMs;
    run.settleSeen = false;
    run.lastMenuFp = "";
    setPhase("等待结算菜单（" + why + "）", "轮次 " + (run.round > 0 ? run.round : "未知"));
    logLine("进入结算：" + why + "（轮次 " + (run.round > 0 ? run.round : "未知") + "）");
  }

  function settlePick(a, items, m, now) {
    var hs = pickIndex(items, cfg.settleKeywords);
    var hc = pickIndex(items, cfg.continueKeywords);
    var hl = pickIndex(items, levelWords(cfg.difficulty));
    var idx = -1, why = "";
    var due = run.cycleEnd || (run.round > 0 && cfg.settleEvery > 0 && run.round % cfg.settleEvery === 0);
    if (!due) {
      if (run.round < 1) { setPhase("轮次尚未确认，等待助手当前轮次", "不自动领奖或继续，可随时停止"); return; }
      if (hc.length !== 1) return doStop("本轮未到结算点，继续挑战菜单不唯一或缺失", "invalid-menu");
      if (!/免费|无需(?:费用|付费)|不(?:消耗|扣费)/.test(items[hc[0]]) || /付费|花费|消耗|金币|zeny|zen|钻石|点券|积分|C点/i.test(items[hc[0]])) return doStop("继续挑战未明确免费，请手动确认", "payment-required");
      idx = hc[0]; why = "免费继续挑战";
    } else if (hs.length === 1) { idx = hs[0]; why = "领奖"; }
    else if (hs.length > 1) return doStop("结算菜单「领奖」命中多项，请手动选择（invalid-menu）：" + items.join(" / "), "invalid-menu");
    else if (hc.length === 1) {
      if (!/免费|无需(?:费用|付费)|不(?:消耗|扣费)/.test(items[hc[0]]) || /付费|花费|消耗|金币|zeny|zen|钻石|点券|积分|C点/i.test(items[hc[0]])) return doStop("继续挑战未明确免费，请手动确认", "payment-required");
      idx = hc[0]; why = "免费继续挑战";
    }
    else if (hc.length > 1) return doStop("结算菜单「继续挑战」命中多项，请手动选择（invalid-menu）：" + items.join(" / "), "invalid-menu");
    else if (hl.length === 1) { idx = hl[0]; why = "难度"; }
    else return doStop("结算菜单里没有可用的领奖或继续项，请手动选择（invalid-menu）：" + items.join(" / "), "invalid-menu");
    var r = chooseBoundMenu(a, m, idx);
    run.lastMenuFp = m.fingerprint;
    if (!r || r.ok !== true) {
      if (r && r.error === "menu-already-used") return;
      return doStop("菜单提交失败（" + ((r && r.error) || "unknown") + "）", "choose-failed");
    }
    run.lastNextFp = "";
    run.noNextSince = 0;
    run.settleSeen = true;
    if (why === "领奖") run.rewardChosen = true;
    run.settleUntil = now + 8000;
    logLine("结算：已选「" + items[idx] + "」（" + why + "）");
  }

  function settleTick(a, s, now) {
    var m = (dialogOpen(s) && s.menu && Array.isArray(s.menu.items) && s.menu.items.length) ? s.menu : null;
    if (m) {
      if (m.fingerprint && m.fingerprint === run.lastMenuFp) {
        setPhase("结算菜单已选过，等服务器回应", "");
        return;
      }
      return settlePick(a, m.items.slice(), m, now);
    }
    if (dialogOpen(s)) return pressNext(a, s, now, "结算");
    if (!run.settleSeen && now < run.settleUntil) return dojoNpcTick(a, s, now);
    if (now < run.settleUntil) {
      setPhase(run.settleSeen ? "结算完成，等下一层" : "等待结算菜单", "");
      return;
    }
    if (run.settleSeen) return finishSettle(now, s);
    logLine("等不到结算菜单，等待服务器确认下一轮，不擅自开战", "warn");
    enterBattleStage(); // 超时只恢复观察，下一轮出怪公告之前不启动战斗或拾取
    setPhase("等待本轮出怪公告", "结算菜单超时，未擅自开战");
  }

  function finishSettle(now, s) {
    if (run.cycleEnd) {
      s = s || call(api(), "snapshot", [OWNER]);
      if (!s || !s.map || sameMap(s.map, run.challengeMap)) {
        setPhase("最终奖励已选", "等待确认离开挑战地图，暂不重新报名");
        return;
      }
    }
    run.lastMenuFp = "";
    run.lastNextFp = "";
    run.settleUntil = 0;
    run.settleSeen = false;
    if (run.cycleEnd) return endCycle("本轮 " + (run.round || 0) + " 轮已结算");
    enterBattleStage(); // 结算后先观察，下一轮出怪公告之前不启动战斗或拾取
    run.noMobWarned = false;
    setPhase("等待本轮出怪公告", "结算完成");
    logLine("结算完成，等待服务器确认下一轮");
  }

  function endCycle(reason) {
    logLine("本轮结束：" + reason);
    if (cfg.autoSignup && run.on) {
      logLine("自动开始下一轮报名");
      beginEntry(run.cycle + 1);
      return;
    }
    doStop(reason + "（自动报名已关闭）", "cycle-done");
  }

  /* ==================== 公告（轮次 / 剩余） ==================== */

  function onNotice(raw) {
    if (!run.on || (run.stage !== "battle" && run.stage !== "settle")) return;
    var current = call(api(), "snapshot", [OWNER]);
    if (!current || identityKey(current) !== run.identity || !sameMap(current.map, run.challengeMap)) return;
    var s = norm(raw), now = nowMs();
    if (!s) return;
    if (s === run.lastNotice && now - run.lastNoticeAt < 2500) return;
    run.lastNotice = s;
    run.lastNoticeAt = now;
    logLine("提示：" + s.slice(0, 80));
    parseNotice(s, now);
    rememberScene(current, { phase: run.roundActive ? "active" : run.stage === "settle" ? "settle" : "idle", round: run.round || null, remaining: run.remaining, source: "current-map-notice" });
    render();
  }
  function parseNotice(s, now) {
    var out = { round: null, remaining: null, completed: null };
    var m = s.match(/第\s*(\d+)\s*[轮层波]/);
    if (m) { run.round = Math.max(run.round || 0, Number(m[1])); out.round = run.round; }
    var mentionedRound = m ? Number(m[1]) : 0;
    m = s.match(/(?:还剩|剩余)\s*[:：]?\s*(\d+)/);
    if (m) { run.remaining = Number(m[1]); out.remaining = run.remaining; }
    if (run.stage === "battle" && /第[ ]*[0-9]+[ ]*[轮层波].*(?:开始|出怪)|(?:开始|出怪).*第[ ]*[0-9]+[ ]*[轮层波]/.test(s) && mentionedRound > run.lastCompletedRound) {
      var current = call(api(), "snapshot", [OWNER]);
      if (current && current.ready && run.challengeMap && sameMap(current.map, run.challengeMap)) {
        if (!run.roundActive) call(api(), "requestPickup", [OWNER, { on: true, types: [4, 5, 6] }]);
        run.roundActive = true; run.noMobSince = 0; run.noMobWarned = false;
        logLine("已确认第 " + mentionedRound + " 轮出怪，允许助手战斗");
      }
    }
    m = s.match(/(?:完成|通过)\s*第?\s*(\d+)\s*[轮层波]|第\s*(\d+)\s*[轮层波]\s*(?:完成|结束|通过)/);
    if (m) {
      var r = Number(m[1] || m[2]);
      if (isFinite(r)) {
        run.round = Math.max(run.round || 0, r);
        out.completed = run.round;
        onRoundDone(run.round, now);
      }
    }
    return out;
  }
  function onRoundDone(round, now) {
    if (run.stage !== "battle" || !run.roundActive || round <= run.lastCompletedRound) return;
    run.lastCompletedRound = round;
    run.roundActive = false;
    if (run.combatOn) { call(api(), "assistCombat", [OWNER, false]); run.combatOn = false; }
    call(api(), "clearBattleTarget", [OWNER]);
    call(api(), "requestPickup", [OWNER, { on: false }]);
    if (cfg.stop100 && round >= cfg.maxRound) {
      run.cycleEnd = true;
      logLine("已达 " + cfg.maxRound + " 轮，结算后开始下一轮循环");
      return beginSettle(now, "轮次到顶");
    }
    if (cfg.settleEvery > 0 && round > 0 && round % cfg.settleEvery === 0) {
      return beginSettle(now, "每 " + cfg.settleEvery + " 轮结算");
    }
  }

  /* ==================== 界面 ==================== */

  var PANEL_CSS_TEXT =
    "#ro-dojo-standalone{position:fixed;left:14px;bottom:14px;z-index:2147483646;width:308px;max-height:76vh;overflow:auto;" +
    "background:#f4f7fc;border:2px solid #1f9d4d;border-radius:12px;color:#16202c;box-shadow:0 10px 30px rgba(0,0,0,.42);" +
    "font:13px/1.6 'Microsoft YaHei',system-ui,sans-serif}" +
    "#ro-dojo-standalone .bar{display:flex;align-items:center;gap:6px;padding:6px 10px;background:#1f9d4d;color:#fff;border-radius:9px 9px 0 0;font-weight:700;cursor:move;user-select:none}" +
    "#ro-dojo-standalone .bar .sp{flex:1 1 auto}" +
    "#ro-dojo-standalone .bar button{background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.34);color:#fff;border-radius:6px;padding:1px 8px;font-size:12px;cursor:pointer;font-weight:600}" +
    "#ro-dojo-standalone .bd{padding:8px 10px}" +
    "#ro-dojo-standalone .sec{font-size:12px;color:#1259b3;font-weight:700;border-left:3px solid #2f6fde;padding-left:8px;margin:2px 0 6px}" +
    "#ro-dojo-standalone .row{padding:6px 2px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #e6ebf2}" +
    "#ro-dojo-standalone .row:last-child{border-bottom:0}" +
    "#ro-dojo-standalone button{background:#2f6fde;color:#fff;border:1px solid #1f5cc9;border-radius:6px;padding:3px 10px;font-size:13px;cursor:pointer;font-weight:600;font-family:inherit}" +
    "#ro-dojo-standalone button:hover{background:#3d7de8}" +
    "#ro-dojo-standalone button.green{background:#1f9d4d;border-color:#17793a}" +
    "#ro-dojo-standalone button.red{background:#d64545;border-color:#b33535}" +
    "#ro-dojo-standalone button[disabled]{opacity:.5;cursor:default}" +
    "#ro-dojo-standalone select{background:#fff;border:1px solid #b9c4d4;color:#16202c;border-radius:5px;padding:3px 6px;font-size:13px;font-family:inherit}" +
    "#ro-dojo-standalone .switch{display:inline-flex;align-items:center;gap:4px;cursor:pointer;color:#3c4d66;font-size:12px}" +
    "#ro-dojo-standalone .switch input{accent-color:#2f6fde;width:13px;height:13px;flex:none}" +
    "#ro-dojo-standalone .box{background:#fff;border:1px solid #dce4f0;border-radius:8px;padding:7px 9px;margin:7px 0}" +
    "#ro-dojo-standalone .b-hd{font-size:12px;color:#1259b3;font-weight:700;margin-bottom:3px}" +
    "#ro-dojo-standalone .st{color:#5a6b7f;font-size:12px;word-break:break-all}" +
    "#ro-dojo-standalone .log{font-size:11px;color:#4a5b76;background:#eef2f8;border-radius:5px;padding:4px 7px;white-space:pre-wrap;max-height:140px;overflow:auto}" +
    "#ro-dojo-standalone .tip{color:#5a6b7f;font-size:12px;line-height:1.55}" +
    "#ro-dojo-standalone .tip a{color:#1259b3}";

  function el(tag, props, kids) {
    var n = document.createElement(tag), k;
    if (props) {
      for (k in props) {
        if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
        var v = props[k];
        if (k === "style") { try { n.style.cssText = v; } catch (e) { n.setAttribute("style", v); } }
        else if (k === "text") n.textContent = v;
        else if (k === "cls") n.className = v;
        else if (k === "on") { for (var ev in v) if (Object.prototype.hasOwnProperty.call(v, ev)) n.addEventListener(ev, v[ev]); }
        else n[k] = v;
      }
    }
    if (kids) for (var i = 0; i < kids.length; i++) if (kids[i]) n.appendChild(kids[i]);
    return n;
  }
  function sep() { return el("div", { cls: "sec", text: "无限挑战（独立脚本）" }); }
  function check(id, label) {
    var box = el("input", { type: "checkbox", id: id });
    return { node: el("label", { cls: "switch" }, [box, el("span", { text: label })]), box: box };
  }

  function buildPanel() {
    if (root) return root;
    ctrls = {};
    startBtn = el("button", { id: "ro-dojo-start", cls: "green", text: "开始", on: { click: function () { doStart(); } } });
    stopBtn = el("button", { id: "ro-dojo-stop", cls: "red", text: "停止", disabled: true, on: { click: function () { doStop("手动停止", "manual"); } } });
    var diff = el("select", { id: "ro-dojo-diff" }, [
      el("option", { value: "basic", text: "初级" }),
      el("option", { value: "middle", text: "中级" }),
      el("option", { value: "advanced", text: "高级" })
    ]);
    diff.addEventListener("change", function () { cfg.difficulty = diff.value; saveCfg(); });
    ctrls.diff = diff;
    var c100 = check("ro-dojo-stop100", "100 轮后结算并重开");
    var cFly = check("ro-dojo-fly", "无怪时飞行");
    var cEmg = check("ro-dojo-emergency", "危险时飞行");
    var cAuto = check("ro-dojo-auto", "自动报名循环");
    [c100, cFly, cEmg, cAuto].forEach(function (c) {
      c.box.addEventListener("change", function () {
        cfg.stop100 = c100.box.checked;
        cfg.fly = cFly.box.checked;
        cfg.emergency = cEmg.box.checked;
        cfg.autoSignup = cAuto.box.checked;
        saveCfg();
      });
    });
    ctrls.stop100 = c100.box; ctrls.fly = cFly.box; ctrls.emergency = cEmg.box; ctrls.auto = cAuto.box;
    statusEl = el("div", { cls: "st", id: "ro-dojo-status", text: statusText() });
    logEl = el("div", { cls: "log", id: "ro-dojo-log" });
    var tip = el("div", { cls: "tip" }, [
      el("div", { text: "用法：先启用 RO 助手并进入游戏，从「脚本执行」打开设置再点「开始」；难度与开关可随时改，点「停止」立即停手。" }),
      el("div", { text: "限制：战斗由助手精灵代打；跨图到报名点会消耗 1 个传送卷轴，同图只走近；只自动拾取卡片与装备；场内须有当前角色的确证，付费继续请手动确认。" }),
      el("div", { text: FILE_HINT }),
      el("div", {}, [el("span", { text: "脚本仓库：" }), el("a", { href: REPO_URL, target: "_blank", text: REPO_URL })])
    ]);
    root = el("div", { id: "ro-dojo-panel", cls: "ro-dojo-panel" }, [
      sep(),
      el("div", { cls: "row" }, [startBtn, stopBtn]),
      el("div", { cls: "row" }, [el("span", { cls: "st", text: "难度" }), diff]),
      el("div", { cls: "row" }, [c100.node, cFly.node]),
      el("div", { cls: "row" }, [cEmg.node, cAuto.node]),
      el("div", { cls: "box" }, [el("div", { cls: "b-hd", text: "状态" }), statusEl]),
      el("div", { cls: "box" }, [el("div", { cls: "b-hd", text: "日志" }), logEl]),
      el("div", { cls: "box" }, [el("div", { cls: "b-hd", text: "说明" }), tip])
    ]);
    try { root.setAttribute("data-ro-dojo", "1"); } catch (e) {}
    syncPanelFromCfg();
    return root;
  }
  function syncPanelFromCfg() {
    try {
      if (ctrls.diff) ctrls.diff.value = cfg.difficulty;
      if (ctrls.stop100) ctrls.stop100.checked = !!cfg.stop100;
      if (ctrls.fly) ctrls.fly.checked = !!cfg.fly;
      if (ctrls.emergency) ctrls.emergency.checked = !!cfg.emergency;
      if (ctrls.auto) ctrls.auto.checked = !!cfg.autoSignup;
    } catch (e) {}
  }

  function injectCss(text) {
    try {
      var st = document.createElement("style");
      st.textContent = text;
      lifecycle.styles.push(st);
      (document.head || document.documentElement).appendChild(st);
    } catch (e) {}
  }

  function mountStandalone() {
    if (wrap && wrap.parentNode) return;
    buildPanel();
    injectCss(PANEL_CSS_TEXT);
    var close = el("button", { text: "收起", on: { click: function () { showPanel(false); } } });
    var bar = el("div", { cls: "bar" }, [el("span", { cls: "sp", text: "无限挑战（独立脚本）" }), close]);
    var body = el("div", { cls: "bd" }, [root]);
    wrap = el("div", { id: "ro-dojo-standalone" }, [bar, body]);
    try { wrap.style.display = "none"; } catch (e) {}      // 开局一律隐藏：任何路径都不得让它自己变得可见
    dragify(wrap, bar);
    document.body.appendChild(wrap);
    mode = "standalone";
  }
  function detachStandalone() {
    try { if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap); } catch (e) {}
    wrap = null;
    try { if (root && holder && root.parentNode !== holder) holder.appendChild(root); } catch (e) {}
  }
  function dragify(node, handle) {
    try {
      var dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0, prev = null;
      handle.addEventListener("mousedown", function (ev) {
        if ((ev.button !== undefined && ev.button !== 0) || (ev.target && ev.target.tagName === "BUTTON")) return;
        if (ev.stopPropagation) ev.stopPropagation();
        dragging = true;
        moved = false;
        try { node.__dshDragged = false; } catch (e) {}
        sx = ev.clientX; sy = ev.clientY;
        var r = node.getBoundingClientRect ? node.getBoundingClientRect() : { left: 0, top: 0 };
        ox = Number(r.left) || 0; oy = Number(r.top) || 0;
        prev = { left: node.style.left, top: node.style.top, right: node.style.right, bottom: node.style.bottom };
        // 顺序不能反：先把当前视口坐标钉成 left/top（此时 right/bottom 还在，视觉零变化），
        // 再让 right/bottom 让位。绝不允许出现「right 已 auto 而 left 还没写」的中间状态 ——
        // 那会让固定定位元素退回静态位置（左边缘），看起来就是「点一下就飞到左边并卡住」。
        node.style.left = ox + "px";
        node.style.top = oy + "px";
        node.style.right = "auto";
        node.style.bottom = "auto";
        ev.preventDefault();
        document.addEventListener("mousemove", onMove, true);
        document.addEventListener("mouseup", onUp, true);
        document.addEventListener("visibilitychange", onUp);
        document.addEventListener("mouseout", onLeave, true);
        window.addEventListener("blur", onUp);
        window.addEventListener("pagehide", onUp);
      });
      lifecycle.cleanups.push(onUp);
      function onMove(ev) {
        if (!dragging) return;
        if ((typeof ev.buttons === "number" && !(ev.buttons & 1)) || document.hidden || !node.parentNode) { onUp(); return; }
        if (Math.abs(ev.clientX - sx) > 3 || Math.abs(ev.clientY - sy) > 3) {
          moved = true;
          try { node.__dshDragged = true; } catch (e) {}
        }
        var x = Math.max(0, ox + ev.clientX - sx), y = Math.max(0, oy + ev.clientY - sy);
        node.style.left = x + "px"; node.style.top = y + "px";
      }
      function onLeave(ev) {
        // mouseout bubbles from ordinary children too; only a missing destination leaves the viewport.
        if (ev.relatedTarget == null) onUp();
      }
      function onUp(ev) {
        if (ev && ev.type === "mouseup" && typeof ev.button === "number" && ev.button !== 0) return;
        if (!dragging) return;
        dragging = false;
        document.removeEventListener("mousemove", onMove, true);
        document.removeEventListener("mouseup", onUp, true);
        document.removeEventListener("visibilitychange", onUp);
        document.removeEventListener("mouseout", onLeave, true);
        window.removeEventListener("blur", onUp);
        window.removeEventListener("pagehide", onUp);
        if (moved) return;                                  // 拖过 >3px 才算拖动（面板位置不落盘，与 1.0.3 一致）
        // 没移动的单击：位置保持原样（把按下时钉的四项还原回去）
        if (prev) {
          node.style.left = prev.left || "";
          node.style.top = prev.top || "";
          node.style.right = prev.right || "";
          node.style.bottom = prev.bottom || "";
        }
      }
    } catch (e) {}
  }
  // 优先复用助手浮窗；不可用时退回自建面板。
  // 这里只注册，不替用户打开；助手脚本执行负责打开设置，收起沿用窗口关闭按钮。
  function registerWindowMode() {
    var a = api();
    if (!a || !isFn(a.registerWindow) || !isFn(a.openWindow)) return false;
    buildPanel();
    var reg = call(a, "registerWindow", [WIN_ID, "无限挑战（独立脚本）", function () { return root; }]);
    if (!reg || reg.ok !== true) return false;
    mode = "window";
    return true;
  }
  function openAssistantWindow() {
    var a = api();
    if (!a || !isFn(a.openWindow)) return false;
    var op = call(a, "openWindow", [WIN_ID]);
    if (!op || op.ok !== true) return false;
    panelOpen = true;
    render();
    return true;
  }

  // 面板是否处于打开状态：拿得到助手浮窗节点就以它为准，拿不到退化为本地标记
  function winNode() {
    try { return document.getElementById("dsh-win-fw-" + WIN_ID) || null; } catch (e) { return null; }
  }
  function winShown() {
    var n = winNode();
    if (!n) return null;
    try {
      var st = n.style || {};
      if (st.display === "none" || st.visibility === "hidden") return false;
      return true;
    } catch (e) { return null; }
  }
  function panelShown() {
    if (mode === "window") {
      var seen = winShown();
      if (seen !== null) return seen;
    }
    return panelOpen === true;
  }
  function showPanel(on) {
    panelOpen = on === true;
    try { if (wrap) wrap.style.display = panelOpen ? "block" : "none"; } catch (e) {}
  }
  function togglePanel() {
    var want = !panelShown();
    if (mode === "window") {
      if (!api()) { logLine("没有找到 RO 助手，暂时打不开面板", "warn"); return; }
      if (want) {
        if (!openAssistantWindow()) logLine("助手浮窗没打开，请确认助手已就绪", "warn");
      } else {
        panelOpen = false;
        var a = api(), cl = call(a, "closeWindow", [WIN_ID]);
        if (!cl || cl.ok !== true) logLine("收起助手浮窗没成功", "warn");
        render();
      }
      return;
    }
    if (want && !wrap) mountStandalone();
    showPanel(want);
  }

  /* ==================== 本地配置（可选） ==================== */

  function loadFileCfg(done) {
    var url = cfg.configUrl || CONFIG_URL;
    if (typeof GM_xmlhttpRequest !== "function") { logLine("未启用本地配置读取（扩展未授权本机文件）"); return done(null); }
    try {
      GM_xmlhttpRequest({
        method: "GET", url: url, timeout: 5000,
        onload: function (r) {
          var text = r && r.responseText;
          if (!text) return done(null);
          var j = null;
          try { j = JSON.parse(text); } catch (e) { logLine("本地配置格式不对，继续用内置默认", "warn"); return done(null); }
          done(j && typeof j === "object" ? j : null);
        },
        onerror: function () { done(null); },
        ontimeout: function () { done(null); }
      });
    } catch (e) { done(null); }
  }

  /* ==================== 启动 ==================== */

  function listen(type, fn) { window.addEventListener(type, fn); lifecycle.listeners.push([type, fn]); }
  function dispose() {
    if (run && run.on) doStop("脚本源码更新，旧实例已停止", "replaced");
    if (lifecycle.timer) clearInterval(lifecycle.timer);
    lifecycle.cleanups.forEach(function (fn) { fn(); });
    lifecycle.listeners.forEach(function (row) { window.removeEventListener(row[0], row[1]); });
    [root, holder, wrap].concat(lifecycle.styles).forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); });
  }

  function boot() {
    buildPanel();
    holder = el("div", { id: "ro-dojo-holder", style: "display:none" }, [root]);
    try { document.body.appendChild(holder); } catch (e) { try { document.documentElement.appendChild(holder); } catch (e2) {} }
    // 助手可用只注册浮窗，不替用户打开；不可用退回自带面板，同样先隐藏 —— 任何路径都不得让面板可见
    if (!registerWindowMode()) mountStandalone();
    logLine("脚本已就绪（" + VERSION + "）；请从助手「脚本执行」打开无限挑战设置");
    render();

    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (mode === "window" || tries > 20) { clearInterval(t); return; }
      if (api() && registerWindowMode()) {
        detachStandalone();
        logLine("已切换到助手浮窗显示");
        if (panelOpen) openAssistantWindow();      // 用户先前已手动打开才跟着打开
        clearInterval(t);
      }
    }, 3000);
    lifecycle.timer = t;

    loadFileCfg(function (j) {
      if (!j) return;
      applyCfg(cfg, j);
      saveCfg();
      syncPanelFromCfg();
      logLine("已读取本地配置：" + CFG_KEYS.filter(function (k) { return Object.prototype.hasOwnProperty.call(j, k); }).join("、"));
    });

    try {
      listen("dsh-ro-assist-notice", function (ev) {
        try { onNotice(ev && ev.detail && (ev.detail.text || ev.detail.message)); } catch (e) {}
      });
      listen("dsh-ro-assist-ready", function () {
        if (mode !== "window" && api() && registerWindowMode()) {
          detachStandalone();
          logLine("已切换到助手浮窗显示");
          if (panelOpen) openAssistantWindow();    // 用户先前已手动打开才跟着打开，不替用户打开
        }
      });
      listen("pagehide", function () {
        clearInterval(t);
        if (run.on) doStop("页面离开", "pagehide");
      });
    } catch (e) {}
  }

  try { boot(); } catch (e) { try { console.error("[无限挑战] 启动失败", e); } catch (e2) {} }

  /* ==================== 测试钩子（只在显式打开时挂上） ==================== */

  try {
    if (window.__RO_DOJO_TEST_HOOK__ === true) {
      window.__RO_DOJO_TEST__ = {
        version: VERSION, defaults: DEFAULTS, cfg: cfg, run: run,
        api: api, apiReport: apiReport, norm: norm, cheb: cheb, mapKey: mapKey, sameMap: sameMap,
        adjacentCell: adjacentCell, pickIndex: pickIndex, classifyMenu: classifyMenu, npcDigest: npcDigest,
        parseNotice: parseNotice, onNotice: onNotice, onRoundDone: onRoundDone,
        doStart: doStart, doStop: doStop, tick: tick, tickBody: tickBody,
        entryTick: entryTick, dialogTick: dialogTick, chooseEntryMenu: chooseEntryMenu,
        battleTick: battleTick, dojoNpcTick: dojoNpcTick, dojoMenuTick: dojoMenuTick,
        beginSettle: beginSettle, settleTick: settleTick, settlePick: settlePick,
        finishSettle: finishSettle, endCycle: endCycle, beginEntry: beginEntry, beginBattle: beginBattle,
        pressNext: pressNext, doTeleport: doTeleport, arrowPreflight: arrowPreflight,
        statusText: statusText, logLines: function () { return run.log.slice(); }, root: function () { return root; },
        mode: function () { return mode; }, applyCfg: applyCfg,
        togglePanel: togglePanel, panelShown: panelShown, wrap: function () { return wrap; },
        winShown: winShown
      };
    }
  } catch (e) {}
})();
