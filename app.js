/* ================= 英语学习小程序 ================= */
"use strict";

/* ---------- 存储 ---------- */
const LS_WORDS = "el_words_v1";
const LS_WRONG = "el_wrong_v1";
const LS_REVIEW_PREFIX = "el_review_";

function loadWords() { try { return JSON.parse(localStorage.getItem(LS_WORDS)) || []; } catch (e) { return []; } }
function saveWords(w) { localStorage.setItem(LS_WORDS, JSON.stringify(w)); }
function loadWrong() { try { return JSON.parse(localStorage.getItem(LS_WRONG)) || []; } catch (e) { return []; } }
function saveWrong(w) { localStorage.setItem(LS_WRONG, JSON.stringify(w)); }

let WORDS = loadWords();     // [{id, word, meaning, phonetic, audioUrl, addedAt}]
let WRONG = loadWrong();     // [wordId,...]  引用 WORDS 的 id

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function findWord(id) { return WORDS.find(w => w.id === id); }
function findWordByText(t) { return WORDS.find(w => w.word.toLowerCase() === String(t).trim().toLowerCase()); }

function addToWrong(id) {
  if (!findWord(id)) return;
  if (!WRONG.includes(id)) { WRONG.push(id); saveWrong(WRONG); }
}
function removeFromWrong(id) {
  const i = WRONG.indexOf(id);
  if (i >= 0) { WRONG.splice(i, 1); saveWrong(WRONG); }
}

/* ---------- 小工具 ---------- */
const $ = sel => document.querySelector(sel);
const main = () => $("#main");

let toastTimer = null;
function toast(msg, type) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (type ? " " + type : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

/* 错词停留：等待按空格/回车继续的按键监听 */
let _waitKey = null;
function setWaitKey(handler) { clearWaitKey(); _waitKey = handler; document.addEventListener("keydown", _waitKey); }
function clearWaitKey() { if (_waitKey) { document.removeEventListener("keydown", _waitKey); _waitKey = null; } }
function waitContinue(handler) {
  return e => {
    if ((e.key === " " || e.key === "Enter") && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault(); clearWaitKey(); handler();
    }
  };
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function norm(s) { return String(s || "").trim().toLowerCase().replace(/\s+/g, ""); }
/* 释义匹配判对：去标点后完全一致/互相包含/字符重合度≥60% 均算正确 */
function meaningMatch(input, ans) {
  const clean = s => String(s || "").toLowerCase().replace(/[，。；、,.;：:\s（）()【】\[\]"'“”‘’·\-\/｜|]/g, "");
  const a = clean(input), b = clean(ans);
  if (!a || !b) return false;
  if (a === b || b.includes(a) || a.includes(b)) return true;
  const setB = new Set(b);
  const setA = new Set(a);
  let hit = 0;
  for (const ch of setA) if (setB.has(ch)) hit++;
  return setA.size >= 2 && hit / setA.size >= 0.6;
}

/* ---------- 音频缓存 (IndexedDB) ---------- */
let _dbP = null;
function idb() {
  if (_dbP) return _dbP;
  _dbP = new Promise((res, rej) => {
    const rq = indexedDB.open("el_audio_cache", 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore("audio");
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
  return _dbP;
}
async function idbGet(key) {
  try {
    const db = await idb();
    return await new Promise((res, rej) => {
      const r = db.transaction("audio").objectStore("audio").get(key);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  } catch (e) { return null; }
}
async function idbPut(key, val) {
  try {
    const db = await idb();
    db.transaction("audio", "readwrite").objectStore("audio").put(val, key);
  } catch (e) { /* 忽略 */ }
}

function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result); fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}

function speakTTS(text) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; u.rate = 0.9;
    speechSynthesis.speak(u);
    return true;
  } catch (e) { return false; }
}

/* ---------- 对/错音效提示（WebAudio，无需联网） ---------- */
let _actx = null;
function playSfx(type) {
  try {
    _actx = _actx || new (window.AudioContext || window.webkitAudioContext)();
    if (_actx.state === "suspended") _actx.resume();
    const t = _actx.currentTime;
    if (type === "ok") { [1046.5, 1318.5, 1568.0].forEach((f, i) => beep(f, t + i * .09, .18, "sine", .22)); }
    else { beep(200, t, .22, "square", .18); beep(150, t + .16, .3, "square", .18); }
  } catch (e) { /* 忽略 */ }
}
function beep(freq, start, dur, wave, vol) {
  const o = _actx.createOscillator(), g = _actx.createGain();
  o.type = wave || "sine"; o.frequency.value = freq;
  g.gain.setValueAtTime(.0001, start);
  g.gain.exponentialRampToValueAtTime(vol || .25, start + .02);
  g.gain.exponentialRampToValueAtTime(.0001, start + dur);
  o.connect(g); g.connect(_actx.destination);
  o.start(start); o.stop(start + dur + .05);
}

/* 播放发音：缩略词若有全称，优先读全称的发音；本地缓存 → 网络音频(顺手缓存) → 浏览器 TTS 兜底 */
async function playAudio(entry) {
  if (!entry) return;
  const text = entry.full || entry.word;
  const cacheKey = text.toLowerCase();
  const cached = await idbGet(cacheKey);
  if (cached) { new Audio(cached).play().catch(() => speakTTS(text)); return; }
  let url = entry.full ? entry.fullAudioUrl : entry.audioUrl;
  if (!url) {
    // 未缓存音频：联网查该文本的发音音频并记入词条
    try {
      const d = await fetchDictionary(text);
      if (d.audioUrl) {
        url = d.audioUrl;
        if (entry.full) entry.fullAudioUrl = url; else entry.audioUrl = url;
        saveWords(WORDS);
      }
    } catch (e) { /* 查不到音频，走 TTS */ }
  }
  if (url) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const blob = await resp.blob();
        const dataUrl = await blobToDataURL(blob);
        await idbPut(cacheKey, dataUrl);
        new Audio(dataUrl).play().catch(() => speakTTS(text));
        return;
      }
    } catch (e) {
      // fetch 被 CORS 拦截时直接流式播放
      const a = new Audio(url);
      a.play().then(() => {}).catch(() => speakTTS(text));
      return;
    }
  }
  speakTTS(text);
}

/* ---------- 查词（释义 + 音标 + 发音） ---------- */
async function fetchWithTimeout(url, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms || 8000);
  try { return await fetch(url, { signal: c.signal }); }
  finally { clearTimeout(t); }
}

async function fetchDictionary(word) {
  // 免费词典 API：返回音标、发音音频、英文释义
  const url = "https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word);
  const resp = await fetchWithTimeout(url, 8000);
  if (!resp.ok) throw new Error("dict " + resp.status);
  const data = await resp.json();
  const entry = data[0] || {};
  let phonetic = entry.phonetic || "";
  let audioUrl = "";
  for (const p of (entry.phonetics || [])) {
    if (!phonetic && p.text) phonetic = p.text;
    if (p.audio) { audioUrl = p.audio; if (!/[-_](us|uk)\b/i.test(p.audio)) continue; break; }
  }
  const defs = [];
  for (const m of (entry.meanings || [])) {
    for (const d of (m.definitions || []).slice(0, 2)) {
      defs.push((m.partOfSpeech ? "(" + m.partOfSpeech + ") " : "") + d.definition);
    }
  }
  return { phonetic, audioUrl, enDef: defs.slice(0, 3).join("；") };
}

async function fetchTranslate(word) {
  // MyMemory 免费翻译 API（英→中）
  const url = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(word) + "&langpair=en|zh-CN";
  const resp = await fetchWithTimeout(url, 8000);
  if (!resp.ok) throw new Error("trans " + resp.status);
  const data = await resp.json();
  const t = (data.responseData && data.responseData.translatedText || "").trim();
  if (!t || /INVALID|QUERY LENGTH|null/i.test(t)) return "";
  return t;
}

async function lookupWord(word) {
  const out = { meaning: "", phonetic: "", audioUrl: "" };
  let dict = null;
  try { dict = await fetchDictionary(word); } catch (e) { dict = null; }
  let zh = "";
  try { zh = await fetchTranslate(word); } catch (e) { zh = ""; }
  if (dict) { out.phonetic = dict.phonetic; out.audioUrl = dict.audioUrl; }
  const looksLikeAnswered = zh && !/[a-zA-Z]{4,}/.test(zh.replace(/[（(].*?[)）]/g, ""));
  if (zh && looksLikeAnswered) out.meaning = zh;
  else if (zh && dict && dict.enDef) out.meaning = zh + "｜" + dict.enDef;
  else if (zh) out.meaning = zh;
  else if (dict && dict.enDef) out.meaning = dict.enDef;
  if (!out.phonetic) out.phonetic = "";
  return out;
}

/* ---------- 汽车行业缩略词内置词库（命中后：单词下方生成全称，释义填中文名称） ---------- */
const AUTO_ABBR = {
  ABS: ["Anti-lock Braking System", "防抱死制动系统"],
  AEBS: ["Advanced Emergency Braking System", "自动紧急制动系统"],
  AEB: ["Autonomous Emergency Braking", "自动紧急制动"],
  FCW: ["Forward Collision Warning", "前碰撞预警系统"],
  LDW: ["Lane Departure Warning", "车道偏离预警系统"],
  LKA: ["Lane Keeping Assist", "车道保持辅助系统"],
  LCC: ["Lane Centering Control", "车道居中辅助系统"],
  ACC: ["Adaptive Cruise Control", "自适应巡航系统"],
  TJA: ["Traffic Jam Assist", "交通拥堵辅助系统"],
  ICA: ["Integrated Cruise Assist", "集成式巡航辅助系统"],
  BSD: ["Blind Spot Detection", "盲区监测系统"],
  LCA: ["Lane Change Assist", "变道辅助系统"],
  RCTA: ["Rear Cross Traffic Alert", "后方交叉路口来车预警"],
  RCTB: ["Rear Cross Traffic Braking", "后方交叉路口来车制动"],
  APA: ["Automatic Parking Assist", "自动泊车辅助系统"],
  RPA: ["Remote Parking Assist", "遥控泊车辅助系统"],
  AVM: ["Around View Monitor", "360°全景影像系统"],
  AVH: ["Auto Vehicle Hold", "自动驻车系统"],
  EPB: ["Electric Parking Brake", "电子驻车制动系统"],
  ESC: ["Electronic Stability Control", "车身电子稳定控制系统"],
  ESP: ["Electronic Stability Program", "电子稳定程序"],
  EPS: ["Electric Power Steering", "电动助力转向系统"],
  TPMS: ["Tire Pressure Monitoring System", "胎压监测系统"],
  HDC: ["Hill Descent Control", "陡坡缓降控制系统"],
  HHC: ["Hill Hold Control", "坡道起步辅助"],
  SRS: ["Supplemental Restraint System", "辅助约束系统（安全气囊）"],
  HUD: ["Head-Up Display", "抬头显示系统"],
  DMS: ["Driver Monitoring System", "驾驶员监测系统"],
  OMS: ["Occupant Monitoring System", "乘员监测系统"],
  ADAS: ["Advanced Driver Assistance Systems", "高级驾驶辅助系统"],
  ECU: ["Electronic Control Unit", "电子控制单元"],
  VCU: ["Vehicle Control Unit", "整车控制器"],
  MCU: ["Motor Control Unit", "电机控制器"],
  TCU: ["Transmission Control Unit", "变速器控制单元"],
  BMS: ["Battery Management System", "电池管理系统"],
  BCM: ["Body Control Module", "车身控制模块"],
  PEPS: ["Passive Entry Passive Start", "无钥匙进入及一键启动系统"],
  OBD: ["On-Board Diagnostics", "车载诊断系统"],
  DTC: ["Diagnostic Trouble Code", "诊断故障码"],
  CAN: ["Controller Area Network", "控制器局域网总线"],
  LIN: ["Local Interconnect Network", "本地互联网络总线"],
  NVH: ["Noise Vibration Harshness", "噪声、振动与声振粗糙度"],
  VIN: ["Vehicle Identification Number", "车辆识别代号"],
  HEV: ["Hybrid Electric Vehicle", "混合动力汽车"],
  PHEV: ["Plug-in Hybrid Electric Vehicle", "插电式混合动力汽车"],
  BEV: ["Battery Electric Vehicle", "纯电动汽车"],
  EREV: ["Extended Range Electric Vehicle", "增程式电动汽车"],
  EV: ["Electric Vehicle", "电动汽车"],
  ICE: ["Internal Combustion Engine", "内燃机"],
  SOC: ["State of Charge", "电池荷电状态（剩余电量）"],
  SOH: ["State of Health", "电池健康状态"],
  NEDC: ["New European Driving Cycle", "新欧洲行驶工况"],
  WLTP: ["Worldwide Harmonized Light Vehicles Test Procedure", "全球轻型汽车统一测试规程"],
  CLTC: ["China Light-Duty Vehicle Test Cycle", "中国轻型汽车行驶工况"],
  OBC: ["On-Board Charger", "车载充电机"],
  DCDC: ["DC-DC Converter", "直流-直流电压变换器"],
  PDU: ["Power Distribution Unit", "高压配电单元"],
  BDU: ["Battery Disconnect Unit", "电池断路单元"],
  DCT: ["Dual Clutch Transmission", "双离合变速器"],
  CVT: ["Continuously Variable Transmission", "无级变速器"],
  AT: ["Automatic Transmission", "自动变速器"],
  MT: ["Manual Transmission", "手动变速器"],
  AWD: ["All Wheel Drive", "全轮驱动"],
  FWD: ["Front Wheel Drive", "前轮驱动"],
  RWD: ["Rear Wheel Drive", "后轮驱动"],
  OTA: ["Over-The-Air", "空中下载（远程升级）"],
  SOP: ["Start of Production", "量产开始"],
  EOP: ["End of Production", "停产"],
  PPV: ["Prototype Production Vehicle", "试制原型车"],
  HMI: ["Human Machine Interface", "人机交互界面"],
  BOM: ["Bill of Material", "物料清单"]
};
function matchAbbr(word) {
  const k = String(word).trim().toUpperCase();
  return /^[A-Z][A-Z0-9\-]{1,9}$/.test(k) && AUTO_ABBR[k] ? AUTO_ABBR[k] : null;
}

/* ---------- 后台补全查询 ---------- */
async function enrichWord(id, force) {
  const w = findWord(id);
  if (!w) return;
  try {
    let r = await lookupWord(w.word);
    // 查不到中文释义时，若有英文全称，按全称反查
    if (!r.meaning && w.full && norm(w.full) !== norm(w.word)) {
      const r2 = await lookupWord(w.full);
      if (r2.meaning) { r.meaning = r2.meaning; if (!r.phonetic) r.phonetic = r2.phonetic; if (!r.audioUrl) r.audioUrl = r2.audioUrl; }
      else if (!w.meaning) { r.meaning = w.full; }
    }
    if (r.meaning) {
      if (w.full) { if (!w.meaning) w.meaning = r.meaning; }
      else if (force || !w.meaning) w.meaning = r.meaning;
    }
    if (r.phonetic) w.phonetic = r.phonetic;
    if (r.audioUrl) w.audioUrl = r.audioUrl;
    delete w.pending;
    saveWords(WORDS);
    if (currentView === "wordbank" || currentView === "wrong") renderWrongTable(currentView);
    if (w.full && r.meaning) toast(`「${w.word}」按全称查询完成`, "ok");
    else if (r.meaning) toast(`「${w.word}」释义查询完成`, "ok");
    else toast(`「${w.word}」未查到：可点击单词添加英文全称备注（自动同步释义），或手动点击释义单元格填写`, "err");
  } catch (e) {
    delete w.pending;
    saveWords(WORDS);
    if (currentView === "wordbank" || currentView === "wrong") renderWrongTable(currentView);
    toast("联网查询失败（" + e.message + "），可稍后点「重查」或手动填写；缩略词可先点「＋添加全称」填入英文全称", "err");
  }
}

/* ---------- 路由 ---------- */
let currentView = "home";
function go(view) {
  currentView = view;
  clearWaitKey();
  if (window.__r1Timer) { clearInterval(window.__r1Timer); window.__r1Timer = null; }
  document.querySelectorAll(".navbtn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  if (view === "home") renderHome();
  else if (view === "wordbank") renderWrongTable("wordbank");
  else if (view === "wrong") renderWrongTable("wrong");
  else if (view === "review") renderReview();
  else if (view === "battle") renderBattle();
}

/* ---------- 首页 ---------- */
function renderHome() {
  main().innerHTML = `
    <h1 class="home-title">英语学习小程序</h1>
    <p class="home-sub">为汽车行业英语打造的私人词库 · 复习 · 拼写训练</p>
    <div class="cards">
      <div class="card" data-go="wordbank">
        <div class="icon">📖</div><h3>单词库</h3>
        <div class="cnt">共 ${WORDS.length} 个单词</div>
      </div>
      <div class="card" data-go="review">
        <div class="icon">🔁</div><h3>复习</h3>
        <div class="cnt">${reviewStatusText()}</div>
      </div>
      <div class="card" data-go="battle">
        <div class="icon">⚔️</div><h3>单词大乱斗</h3>
        <div class="cnt">拼写挑战</div>
      </div>
      <div class="card" data-go="wrong">
        <div class="icon">❌</div><h3>错题库</h3>
        <div class="cnt">待消灭 ${WRONG.filter(findWord).length} 个</div>
      </div>
    </div>`;
  main().querySelectorAll(".card").forEach(c => c.addEventListener("click", () => go(c.dataset.go)));
}
function reviewStatusText() {
  const plan = getPlan();
  if (!plan) return "今日：未开始";
  if (plan.finished) return "今日：已完成 ✔";
  return `今日：第 ${plan.round} 遍进行中`;
}

/* ---------- 通用词表渲染（单词库 / 错题库共用格式） ---------- */
function wordTableHTML(list, mode) {
  if (!list.length) return `<div class="empty">${mode === "wrong" ? "错题库为空，继续保持！" : "词库为空，先在上方输入一个单词吧"}</div>`;
  const rows = list.map((w, i) => {
    let noteCell = "";
    const PH_NOTE = "输入英文全称（释义自动更新）或中文备注";
    if (w.note !== undefined || w.full) {
      let shown;
      if (w.note !== undefined && w.note !== "") shown = esc(w.note);
      else if (w.note === "") shown = `<span style='color:#0ea5e9;font-size:12px'>${PH_NOTE}</span>`;
      else shown = esc(w.full);
      noteCell = `<div class="w-note" contenteditable="true" data-field="note" title="点击可修改">${shown}</div>`;
    }
    return `
    <tr data-id="${w.id}">
      <td>${i + 1}</td>
      <td><div class="w-word w-clickable" title="点击添加备注">${esc(w.word)}</div>${noteCell}</td>
      <td class="w-meaning-cell"><span class="w-meaning" contenteditable="true" data-field="meaning">${esc(w.meaning) || (w.pending ? "<span style='color:#6366f1'>🔎 联网查询中…</span>" : "<span style='color:#cbd5e1'>点击填写释义</span>")}</span></td>
      <td><span class="w-phon" title="点击播放发音">${w.phonetic ? esc(w.phonetic) : "<span style='color:#cbd5e1'>—</span>"}<span class="spk">🔊</span></span></td>
      <td style="white-space:nowrap">
        <button class="btn sm ghost" data-act="requery">重查</button>
        ${mode === "wrong"
          ? `<button class="btn sm ghost" data-act="remove">移出错题库</button>`
          : `<button class="btn sm danger" data-act="del">删除</button>`}
      </td>
    </tr>`;
  }).join("");
  return `<table class="wb"><thead><tr>
    <th style="width:52px">序号</th><th style="width:200px">英语单词</th><th>单词释义</th>
    <th style="width:150px">音标（点击发音）</th><th style="width:170px">操作</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

function bindTableEvents(mode) {
  const root = main();
  const PH_MEAN = "点击填写释义", PH_NOTE = "输入英文全称（释义自动更新）或中文备注";
  root.querySelectorAll("tr[data-id]").forEach(tr => {
    const id = tr.dataset.id;
    const w = findWord(id);
    if (!w) return;
    const mean = tr.querySelector(".w-meaning");
    mean.addEventListener("focus", () => { if (mean.textContent.trim() === PH_MEAN) mean.textContent = ""; });
    mean.addEventListener("blur", () => {
      if (w.pending) return;
      let v = mean.textContent.trim();
      if (v === PH_MEAN) { mean.innerHTML = "<span style='color:#cbd5e1'>" + PH_MEAN + "</span>"; return; }
      if (v !== w.meaning) { w.meaning = v; saveWords(WORDS); toast("释义已保存", "ok"); }
    });
    mean.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); mean.blur(); } });
    const wordEl = tr.querySelector(".w-word");
    if (wordEl) wordEl.addEventListener("click", () => {
      if (!confirm(`是否为「${w.word}」添加备注？\n输入英文全称 → 释义自动搜索并同步更新\n输入中文 → 仅保存备注，不修改释义`)) return;
      if (w.note === undefined && !w.full) { w.note = ""; saveWords(WORDS); }
      renderWrongTable(mode);
      const nt = document.querySelector(`tr[data-id="${w.id}"] .w-note`);
      if (nt) nt.focus();
    });
    const note = tr.querySelector(".w-note");
    if (note) {
      note.addEventListener("focus", () => { if (note.textContent.trim() === PH_NOTE) note.textContent = ""; });
      note.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); note.blur(); } });
      note.addEventListener("blur", async () => {
        let v = note.textContent.trim();
        if (v === PH_NOTE) v = "";
        if ((w.note || "") === v) return;
        const looksFull = !!v && !/[\u4e00-\u9fff\u3400-\u4dbf]/.test(v) && /^[A-Za-z][A-Za-z0-9\s\-\/&,.()]*$/.test(v);
        w.note = v;
        if (looksFull) w.full = v;
        saveWords(WORDS);
        if (looksFull) {
          toast(`已识别为全称，正在自动查询释义…`);
          try {
            const r = await lookupWord(v);
            if (r.meaning) { w.meaning = r.meaning; saveWords(WORDS); toast(`释义已按全称更新：${r.meaning}`, "ok"); }
            else toast("全称释义未查到，可手动填写释义或点「重查」", "err");
          } catch (e) { toast("查询失败，可稍后点「重查」", "err"); }
        } else if (v) {
          toast("备注已保存（中文备注不修改释义）", "ok");
        }
        if (currentView === "wordbank" || currentView === "wrong") renderWrongTable(currentView);
      });
    }
    tr.querySelector(".w-phon").addEventListener("click", () => playAudio(w));
    tr.querySelector('[data-act="requery"]').addEventListener("click", e => {
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = "查询中";
      enrichWord(id, true).finally(() => { btn.disabled = false; btn.textContent = "重查"; });
    });
    const act = tr.querySelector(mode === "wrong" ? '[data-act="remove"]' : '[data-act="del"]');
    act.addEventListener("click", () => {
      if (mode === "wrong") { removeFromWrong(id); renderWrongTable("wrong"); }
      else {
        if (!confirm(`确定删除单词「${w.word}」？（同时移出错题库）`)) return;
        WORDS = WORDS.filter(x => x.id !== id);
        removeFromWrong(id);
        saveWords(WORDS);
        renderWrongTable("wordbank");
      }
    });
  });
}

function renderWrongTable(mode) {
  const isWrong = mode === "wrong";
  const list = isWrong ? WRONG.map(findWord).filter(Boolean) : WORDS;
  main().innerHTML = `
    <div class="panel">
      <div class="stickyhead">
      <h2>${isWrong ? "❌ 错题库" : "📖 单词库"}</h2>
      ${isWrong ? "" : `
      <div class="addrow">
        <input id="newWord" placeholder="输入英语单词或缩写（如 ABS / AEBS），回车自动查询并添加" />
        <button class="btn" id="btnAdd">查询并添加</button>
      </div>`}
      </div>
      <div id="tableWrap">${wordTableHTML(list, mode)}</div>
      <p class="tip">${isWrong
        ? "错题库汇集复习 / 大乱斗中没有记住的单词；在单词大乱斗中拼写正确即可自动移出。复习时错题库单词优先。"
        : "汽车缩写自动匹配内置词库生成全称和中文释义；其他单词可【点击单词】选择是否添加备注：输入英文全称会自动同步更新释义，输入中文则仅作为备注保留。释义与备注均可点击修改；点击 🔊 播放发音，首次播放后自动缓存为音频。"}</p>
    </div>`;
  bindTableEvents(mode);
  if (!isWrong) {
    const inp = $("#newWord"), btn = $("#btnAdd");
    const add = () => {
      const word = (inp.value || "").trim();
      if (!word) { toast("请输入单词", "err"); return; }
      if (findWordByText(word)) { toast("该单词已在词库中", "err"); return; }
      // 先立即入库显示，再后台异步查询释义/音标（网络慢或失败都不影响添加）
      const entry = { id: uid(), word, meaning: "", phonetic: "", audioUrl: "", addedAt: Date.now(), pending: true };
      const abbr = matchAbbr(word);
      if (abbr) { entry.full = abbr[0]; entry.meaning = abbr[1]; delete entry.pending; }
      WORDS.push(entry); saveWords(WORDS);
      renderWrongTable("wordbank");
      toast(abbr ? `已添加「${word}」，命中内置汽车缩略词库：全称与中文释义已自动生成` : `已添加「${word}」，正在联网查询释义和音标…`);
      enrichWord(entry.id);
    };
    btn.addEventListener("click", add);
    inp.addEventListener("keydown", e => { if (e.key === "Enter") add(); });
    inp.focus();
  }
}

/* ---------- 复习模块 ---------- */
function buildPlan() {
  const n = Math.min(WORDS.length, 20);
  if (n === 0) return null;
  const wrongIds = WRONG.filter(findWord);
  const picked = wrongIds.slice(0, n);
  if (picked.length < n) {
    const rest = WORDS.filter(w => !picked.includes(w.id));
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    picked.push(...rest.slice(0, n - picked.length).map(w => w.id));
  }
  return { date: todayStr(), wordIds: picked, round: 1, idx: 0, results: {}, finished: false };
}
function getPlan() {
  try {
    const p = JSON.parse(localStorage.getItem(LS_REVIEW_PREFIX + todayStr()));
    return p && p.wordIds && p.wordIds.length ? p : null;
  } catch (e) { return null; }
}
function savePlan(p) { localStorage.setItem(LS_REVIEW_PREFIX + p.date, JSON.stringify(p)); }

let plan = null;
function syncPlan() {
  // 词库变动后同步今日复习计划：新单词自动补入（上限20，错题库优先），已删除的移出
  const valid = plan.wordIds.filter(id => findWord(id));
  let changed = valid.length !== plan.wordIds.length;
  const target = Math.min(WORDS.length, 20);
  const have = new Set(valid);
  const news = WORDS.filter(w => !have.has(w.id)).map(w => w.id);
  const queue = news.filter(id => WRONG.includes(id)).concat(news.filter(id => !WRONG.includes(id)));
  if (valid.length < target && queue.length) {
    while (valid.length < target && queue.length) valid.push(queue.shift());
    changed = true;
  }
  if (changed) {
    plan.wordIds = valid;
    if (plan.finished) { plan.finished = false; plan.round = 1; plan.idx = 0; }
    if (plan.idx >= valid.length) plan.idx = Math.max(0, valid.length - 1);
  }
  return changed;
}
function renderReview() {
  plan = getPlan() || buildPlan();
  if (!plan) {
    main().innerHTML = `<div class="panel stage"><h2>🔁 复习</h2><div class="empty">单词库还是空的，先去「单词库」添加几个单词吧</div></div>`;
    return;
  }
  const changed = syncPlan();
  savePlan(plan);
  drawReviewStage();
  if (changed) toast("复习计划已更新：新加入的单词已自动补入今日复习", "ok");
}

const ROUND_INFO = {
  1: { label: "第一遍 · 看单词，写释义", hint: "输入该单词的中文释义（能写出大意即可，对照后自评）" },
  2: { label: "第二遍 · 看释义，拼单词", hint: "根据释义拼写英语单词，按空格键判定" },
  3: { label: "第三遍 · 听发音，拼单词", hint: "点击 ▶ 播放发音（可重复听），拼写单词" }
};

function drawReviewStage() {
  clearWaitKey();
  const total = plan.wordIds.length;
  if (plan.finished) {
    const r = plan.results;
    const wrongCnt = plan.wordIds.filter(id => (r[id] && (r[id].r2 === false || r[id].r3 === false || r[id].r1 === "bad"))).length;
    main().innerHTML = `
      <div class="panel stage">
        <h2>🔁 今日复习完成</h2>
        <div class="summary">
          <div class="big">🎉</div>
          <h3>今日 ${total} 个单词三遍复习已完成</h3>
          <p>未记住：${wrongCnt} 个${wrongCnt ? "，已自动加入错题库，明天优先复习" : ""}<br>
          明天再来，或者去「单词大乱斗」检验一下？</p>
          <div class="qactions" style="margin-top:18px">
            <button class="btn ghost" id="btnBackHome">回首页</button>
            <button class="btn" id="btnGoBattle">去大乱斗</button>
            <button class="btn ghost" id="btnReset">重新开始今日复习</button>
          </div>
        </div>
      </div>`;
    $("#btnBackHome").addEventListener("click", () => go("home"));
    $("#btnGoBattle").addEventListener("click", () => go("battle"));
    $("#btnReset").addEventListener("click", () => { localStorage.removeItem(LS_REVIEW_PREFIX + plan.date); renderReview(); });
    return;
  }

  const round = plan.round;
  const idx = plan.idx;
  const w = findWord(plan.wordIds[idx]);
  if (!w) { nextReviewCard(); return; }
  plan.results[w.id] = plan.results[w.id] || {};

  const pills = [1, 2, 3].map(r =>
    `<span class="pill ${r === round ? "on" : (plan.results.__roundDone || {})[r] ? "done" : ""}">${ROUND_INFO[r].label}</span>`).join("");

  let body = "";
  if (round === 1) {
    body = `
      <div class="qmain">${esc(w.word)}</div>
      <div class="qsub">${w.phonetic ? esc(w.phonetic) + " <span class='w-phon' id='pk' style='font-size:16px'>🔊</span>" : ""}</div>
      <input class="qinput" id="ans" placeholder="写出中文释义，按空格键判定…" autocomplete="off">
      <div class="feedback" id="fb"></div>`;
  } else if (round === 2) {
    body = `
      <div class="qmain meaning">${esc(w.meaning) || "（该词暂无释义，请回单词库补充）"}</div>
      <div class="qsub">请拼写对应的英语单词</div>
      <input class="qinput" id="ans" placeholder="输入英文单词，按空格键判定" autocomplete="off" spellcheck="false">
      <div class="feedback" id="fb"></div>
      <div class="qactions"><button class="btn" id="btnCheck">提交</button></div>`;
  } else {
    body = `
      <div class="qmain">🔊 <span id="playBtn" class="w-phon" style="font-size:22px;cursor:pointer">点击播放发音（可重听）</span></div>
      <div class="qsub">根据发音拼写单词</div>
      <input class="qinput" id="ans" placeholder="输入英文单词，按空格键判定" autocomplete="off" spellcheck="false">
      <div class="feedback" id="fb"></div>
      <div class="qactions"><button class="btn" id="btnCheck">提交</button></div>`;
  }

  main().innerHTML = `
    <div class="panel stage">
      <h2>🔁 每日复习 <span style="font-size:13px;color:#64748b;font-weight:400">（${plan.date} · 共 ${total} 词）</span>
        <button class="btn ghost sm" id="btnRebuild" style="float:right;margin-top:-4px">🔄 更换今日复习词</button></h2>
      <div class="roundbar">${pills}</div>
      <div class="qprog">第 ${idx + 1} / ${total} 个</div>
      <div class="qcard">${body}</div>
      <p class="tip">规则：输入完成后按空格键（或回车）判定；答对→停留约 2.5 秒后自动下一词；答错→释义/答案一直显示，按空格或回车手动确认后继续；第一遍看词写义，第二遍看义拼词，第三遍听音拼词；错词自动入错题库，每遍结束自动开启下一遍。</p>
    </div>`;

  $("#btnRebuild").addEventListener("click", () => {
    if (!confirm("重新抽取今日复习单词？当前进度将清空。")) return;
    const np = buildPlan();
    if (np) { plan = np; savePlan(plan); drawReviewStage(); toast("已重新抽取今日复习词", "ok"); }
  });

  const ans = $("#ans"), fb = $("#fb");
  if ($("#pk")) $("#pk").addEventListener("click", () => playAudio(w));
  if (round === 3) playAudio(w);

  if (round === 1) {
    let doneR1 = false;
    const finish = (ok) => {
      if (doneR1) return;
      doneR1 = true;
      plan.results[w.id].r1 = ok ? "good" : "bad";
      if (ok) {
        playSfx("ok");
        fb.className = "feedback ok"; fb.innerHTML = `<span class="fb-word">` + esc(w.word) + `</span>`;
        ans.classList.add("right");
        ans.disabled = true;
        setTimeout(() => playAudio(w), 500);
        setTimeout(nextReviewCard, 2700); // 多停留 1 秒再跳转
      } else {
        addToWrong(w.id);
        playSfx("bad");
        fb.className = "feedback bad"; fb.innerHTML = `<span class="fb-meaning">` + esc(w.meaning || "（暂无释义）") + `</span><span class="fb-hint">空格/回车继续</span>`;
        ans.classList.add("wrong");
        ans.disabled = true;
        setWaitKey(waitContinue(nextReviewCard));
      }
    };
    // 按空格键后才识别判定（兼容输入法：选词时的空格不会误触发）
    ans.addEventListener("keydown", e => {
      if (e.key !== " " && e.key !== "Enter") return;
      if (doneR1 || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      const v = ans.value.trim();
      if (!v) { toast("请先写出释义，再按空格键判定", "err"); return; }
      if (!w.meaning) { finish(true); return; }
      finish(meaningMatch(v, w.meaning));
    });
    ans.focus();
  } else {
    if (round === 3 && $("#playBtn")) $("#playBtn").addEventListener("click", () => playAudio(w));
    let revLock = false;
    const finish = (ok) => {
      if (revLock) return;
      revLock = true;
      plan.results[w.id][round === 2 ? "r2" : "r3"] = ok;
      if (ok) {
        removeFromWrong(w.id);
        playSfx("ok");
        fb.className = "feedback ok";
        fb.innerHTML = `<span class="fb-word">` + esc(w.word) + `</span>` + (round === 3 ? `<div class="fb-meaning">${esc(w.meaning) || "（暂无释义）"}</div>` : "");
        ans.classList.add("right");
        if (round === 2) {
          setTimeout(() => playAudio(w), 500);
          setTimeout(nextReviewCard, 2500); // 多停留 1 秒再跳转
        } else {
          // 第三遍听音拼词：刚听过发音，不重播，停留 1.9 秒
          setTimeout(nextReviewCard, 1900);
        }
      } else {
        addToWrong(w.id);
        playSfx("bad");
        fb.className = "feedback bad";
        fb.innerHTML = `<span class="fb-word">` + esc(w.word) + `</span>` + `<span class="fb-hint">空格/回车继续</span>` + (round === 3 ? `<div class="fb-meaning">${esc(w.meaning) || "（暂无释义）"}</div>` : "");
        ans.classList.add("wrong");
        setWaitKey(waitContinue(nextReviewCard));
      }
    };
    // 按空格键后才识别判定（兼容输入法：选词时的空格不会误触发）
    const submit = () => {
      if (revLock) return;
      const v = ans.value.trim();
      if (!v) { toast("请先作答，再按空格键判定", "err"); return; }
      finish(norm(v) === norm(w.word));
    };
    ans.addEventListener("keydown", e => {
      if ((e.key === " " || e.key === "Enter") && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); submit(); }
    });
    $("#btnCheck").addEventListener("click", submit);
    ans.focus();
  }
}

function nextReviewCard() {
  const total = plan.wordIds.length;
  if (plan.idx + 1 < total) {
    plan.idx++;
  } else if (plan.round < 3) {
    plan.round++;
    plan.idx = 0;
    plan.results.__roundDone = plan.results.__roundDone || {};
    plan.results.__roundDone[plan.round - 1] = true;
    toast(`本轮结束，自动开启 ${ROUND_INFO[plan.round].label}`);
  } else {
    plan.finished = true;
  }
  savePlan(plan);
  drawReviewStage();
}

/* ---------- 单词大乱斗 ---------- */
let battle = null; // {queue:[ids], idx, right, wrong, currentId}
function renderBattle() {
  if (WORDS.length === 0) {
    main().innerHTML = `<div class="panel stage"><h2>⚔️ 单词大乱斗</h2><div class="empty">单词库为空，先去添加单词吧</div></div>`;
    return;
  }
  if (!battle) {
    main().innerHTML = `
      <div class="panel stage">
        <h2>⚔️ 单词大乱斗</h2>
        <div class="summary">
          <div class="big">🏟️</div>
          <h3>随机抽取单词库中的单词</h3>
          <div class="qactions" style="margin-top:18px"><button class="btn" id="btnStart">开始挑战</button></div>
        </div>
      </div>`;
    $("#btnStart").addEventListener("click", () => {
      const ids = WORDS.map(w => w.id);
      for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
      battle = { queue: ids, idx: 0, right: 0, wrong: 0, locked: false };
      drawBattle();
    });
    return;
  }
  drawBattle();
}

function drawBattle() {
  clearWaitKey();
  if (battle.idx >= battle.queue.length) {
    main().innerHTML = `
      <div class="panel stage">
        <h2>⚔️ 大乱斗结算</h2>
        <div class="summary">
          <div class="big">${battle.wrong === 0 ? "🏆" : "💪"}</div>
          <h3>本轮 ${battle.queue.length} 题完成</h3>
          <div class="scorebar">
            <div><div class="num g">${battle.right}</div><div style="font-size:13px;color:#64748b">答对</div></div>
            <div><div class="num r">${battle.wrong}</div><div style="font-size:13px;color:#64748b">答错（已入错题库）</div></div>
          </div>
          <p>错题库中答对的单词已自动移出。<br>错题库现有 ${WRONG.filter(findWord).length} 个待消灭。</p>
          <div class="qactions" style="margin-top:16px">
            <button class="btn" id="btnAgain">再来一轮</button>
            <button class="btn ghost" id="btnBackHome2">回首页</button>
          </div>
        </div>
      </div>`;
    $("#btnAgain").addEventListener("click", () => { battle = null; renderBattle(); $("#btnStart") && $("#btnStart").click(); });
    $("#btnBackHome2").addEventListener("click", () => { battle = null; go("home"); });
    return;
  }

  const w = findWord(battle.queue[battle.idx]);
  if (!w) { battle.idx++; drawBattle(); return; }
  battle.locked = false;
  main().innerHTML = `
    <div class="panel stage">
      <h2>⚔️ 单词大乱斗 <span style="font-size:13px;color:#64748b;font-weight:400">错题库剩 ${WRONG.filter(findWord).length} 词</span></h2>
      <div class="qprog">第 ${battle.idx + 1} / ${battle.queue.length} 题 ｜ 当前得分 <b style="color:#15803d">${battle.right}</b> : <b style="color:#b91c1c">${battle.wrong}</b></div>
      <div class="qcard">
        <div class="qhint">根据释义拼写单词</div>
        <div class="qmain meaning">${esc(w.meaning) || "（该词暂无释义，请回单词库补充后重来）"}</div>
        <input class="qinput" id="sans" placeholder="输入英文单词，按空格键判定" autocomplete="off" spellcheck="false">
        <div class="feedback" id="sfb"></div>
        <div class="qactions"><button class="btn" id="btnSCheck">提交</button></div>
      </div>
    </div>`;
  const ans = $("#sans"), fb = $("#sfb");
  const finish = (ok) => {
    if (battle.locked) return;
    battle.locked = true;
    if (ok) {
      battle.right++;
      removeFromWrong(w.id);
      playSfx("ok");
      fb.className = "feedback ok"; fb.innerHTML = `<span class="fb-word">` + esc(w.word) + `</span>`;
      ans.classList.add("right");
      setTimeout(() => playAudio(w), 250); // 正确音效后间隔缩短为 0.25 秒再播发音
      setTimeout(() => { clearWaitKey(); battle.idx++; drawBattle(); }, 2300);
    } else {
      battle.wrong++;
      addToWrong(w.id);
      playSfx("bad");
      fb.className = "feedback bad"; fb.innerHTML = `<span class="fb-word">` + esc(w.word) + `</span>` + `<span class="fb-hint">空格/回车继续</span>`;
      ans.classList.add("wrong");
      setWaitKey(waitContinue(() => { battle.idx++; drawBattle(); }));
    }
  };
  // 按空格键后才识别判定（兼容输入法，避免输一半就判错）
  const submit = () => {
    if (battle.locked) return;
    const v = ans.value.trim();
    if (!v) { toast("请先作答，再按空格键判定", "err"); return; }
    finish(norm(v) === norm(w.word));
  };
  ans.addEventListener("keydown", e => {
    if ((e.key === " " || e.key === "Enter") && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); submit(); }
  });
  $("#btnSCheck").addEventListener("click", submit);
  ans.focus();
}

/* ---------- 启动 ---------- */
// 清理上次残留的“查询中”状态
 if (WORDS.some(w => w.pending)) { WORDS.forEach(w => delete w.pending); saveWords(WORDS); }
document.querySelectorAll(".navbtn").forEach(b => b.addEventListener("click", () => go(b.dataset.view)));
$("#btnHome").addEventListener("click", () => go("home"));
go("home");
