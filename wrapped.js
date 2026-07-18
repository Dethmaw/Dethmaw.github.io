// WhatsApp Wrapped — a full-screen animated story deck over the computed stats.
// Reads window.__stats (recomputed on anonymized names when ANON is on) and window.__lang.
// Self-mounts a launch button into the share bar (#share). Vanilla; no deps.
// v2 deck: a story arc (origins → records → signatures → award night → feelings → finale).
// No blocking input — drumroll teaser slides auto-reveal; taps only navigate.
// Deliberately inverted vs the report: the report leads with totals/rating, so the deck
// saves them for the finale and opens with the first message instead.
import { relTitle, PALETTE } from "./render.js";

const $w = () => document.getElementById("wrapped");

// ---- language (read at open time) ----
let lang = "tr";
const tx = (tr, en) => (lang === "en" ? en : tr);
const loc = () => (lang === "en" ? "en-US" : "tr-TR");
const fmt = (n) => Number(n).toLocaleString(loc());
const fmtDate = (d) => new Date(d).toLocaleDateString(loc(), { day: "numeric", month: "long", year: "numeric" });
const hhmm = (d) => { const x = new Date(d); return String(x.getHours()).padStart(2, "0") + ":" + String(x.getMinutes()).padStart(2, "0"); };
const dayFromKey = (k) => { const [y, mo, d] = k.split("-").map(Number); return new Date(y, mo, d); }; // busiest_day key: "Y-M-D", month 0-indexed

// ---- fx / number helpers ----
const rand = (a, b) => a + Math.random() * (b - a);
const buzz = (ms) => { if (navigator.vibrate) navigator.vibrate(ms); }; // haptic; no-op on desktop

// ---- audio: synthesized event SFX only (no music bed, no asset files) ----
let AC = null, masterGain = null, muted = false;
function ensureAudio() {
  if (AC) return;
  const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
  AC = new Ctx();
  masterGain = AC.createGain(); masterGain.gain.value = 0.9; masterGain.connect(AC.destination);
}
function tone(freq, dur, type = "sine", vol = 0.3, sweepTo = null) {
  if (!AC || muted) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, AC.currentTime);
  if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, AC.currentTime + dur);
  g.gain.setValueAtTime(0.0001, AC.currentTime);
  g.gain.exponentialRampToValueAtTime(vol, AC.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
  o.connect(g); g.connect(masterGain); o.start(); o.stop(AC.currentTime + dur + 0.02);
}
const sfx = {
  whoosh: () => tone(180, 0.35, "sawtooth", 0.1, 520),
  pop: () => tone(680, 0.14, "sine", 0.32),
  ding: () => { tone(880, 0.5, "triangle", 0.28); setTimeout(() => tone(1320, 0.5, "triangle", 0.18), 60); },
  sparkle: () => { for (let i = 0; i < 5; i++) setTimeout(() => tone(1200 + Math.random() * 900, 0.18, "sine", 0.12), i * 70); },
  drum: () => { for (let i = 0; i < 4; i++) setTimeout(() => tone(140, 0.08, "square", 0.22), i * 90); },
};
function setMuted(m) { muted = m; if (masterGain) masterGain.gain.value = m ? 0 : 0.9; const b = el(".wmute"); if (b) b.textContent = m ? "🔇" : "🔊"; }
function confettiBurst(n = 48) {
  const fx = $w().querySelector(".wfx");
  const colors = ["#ffd76a", "#25d366", "#53b1fd", "#ff6a95", "#a78bfa", "#fff"];
  for (let i = 0; i < n; i++) {
    const d = document.createElement("div"); d.className = "confetti"; const s = rand(6, 12);
    d.style.cssText = `left:${rand(0, 100)}%;top:-20px;width:${s}px;height:${s * rand(0.5, 1.2)}px;background:${colors[i % colors.length]};border-radius:2px;--r:${rand(-720, 720)}deg;animation:wfall ${rand(2.2, 4)}s linear forwards`;
    fx.appendChild(d); setTimeout(() => d.remove(), 4200);
  }
  buzz(30); sfx.sparkle();
}
function emojiRain(list, n = 24) {
  const fx = $w().querySelector(".wfx");
  for (let i = 0; i < n; i++) {
    const e = document.createElement("div"); e.className = "rainmoji"; e.textContent = list[i % list.length];
    e.style.cssText = `left:${rand(0, 100)}%;top:-40px;--r:${rand(-90, 90)}deg;font-size:${rand(18, 40)}px;opacity:${rand(0.6, 1)};animation:wfall ${rand(2.6, 4.6)}s linear forwards`;
    fx.appendChild(e); setTimeout(() => e.remove(), 4800);
  }
}
function countUp(el, to, dur = 1300) {
  const start = performance.now(), f = (x) => Math.round(x).toLocaleString(loc());
  (function tick(now) { const p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = f(to * e); if (p < 1) requestAnimationFrame(tick); })(start);
}
function odometer(el, value) {
  const s = Math.round(value).toLocaleString(loc()); el.classList.add("odo"); el.innerHTML = ""; let col = 0;
  for (const ch of s) {
    if (ch < "0" || ch > "9") { const sep = document.createElement("span"); sep.className = "odo-sep"; sep.textContent = ch; el.appendChild(sep); continue; }
    const wrap = document.createElement("span"); wrap.className = "odo-col";
    const reel = document.createElement("span"); reel.className = "odo-reel";
    for (let d = 0; d <= 9; d++) { const dg = document.createElement("span"); dg.textContent = d; reel.appendChild(dg); }
    wrap.appendChild(reel); el.appendChild(wrap);
    const target = +ch, delay = col * 90;
    requestAnimationFrame(() => setTimeout(() => { reel.style.transform = `translateY(-${target}em)`; }, delay));
    col++;
  }
}

// ---- stats adapters ----
function nightOwlTop(champs) { // {sender: pct} → [sender, pct] of the max
  const e = Object.entries(champs.night_owl || {});
  return e.length ? e.reduce((a, b) => (b[1] > a[1] ? b : a)) : ["—", 0];
}
function latestHour(champs) { // {sender: hour} → the latest peak clock-hour
  const e = Object.entries(champs.peak_hour || {}).filter(([, h]) => h != null);
  return e.length ? e.reduce((a, b) => (b[1] > a[1] ? b : a)) : null;
}
function sigWord(s) { // sender + [word,count] with the single most-repeated top word
  const c = s.core.senders.map((x) => ({ s: x, w: (s.fun.top_words?.[x] || [])[0] })).filter((o) => o.w);
  return c.sort((a, b) => b.w[1] - a.w[1])[0] || null;
}
function sigPhrase(s) { // sender + [phrase,count] with the single most-repeated multi-word phrase
  const c = s.core.senders.map((x) => ({ s: x, w: (s.fun.top_phrases?.[x] || [])[0] })).filter((o) => o.w);
  return c.sort((a, b) => b.w[1] - a.w[1])[0] || null;
}
function topMilestone(nth) { // highest reached milestone (n>1) → [n, Date]
  const n = Object.keys(nth || {}).map(Number).filter((k) => k > 1).sort((a, b) => b - a)[0];
  return n ? [n, nth[n]] : null;
}

function spiceLevel(s) { // flirtation signals → [level 0..100, flirt count]. Heuristic meter.
  const flirts = s.core.senders.reduce((t, x) => t + (s.content?.[x]?.spice || 0), 0);
  // ponytail: scaled flirt-rate, capped; exact value isn't load-bearing (it's a radar bar).
  return [Math.max(5, Math.min(100, Math.round(2000 * flirts / Math.max(1, s.core.total)))), flirts];
}

function podiumHTML(s) { // top talkers, tallest-first, colored by the report's PALETTE
  const t = s.core.senders.map((x) => ({ name: x, count: s.core.per_sender[x].messages })).sort((a, b) => b.count - a.count).slice(0, 4);
  const mx = t[0].count || 1;
  const cols = t.map((p, i) => `<div class="col ${i === 0 ? "first" : ""}"><div class="pod-name">${p.name}</div><div class="bk" style="--h:${(40 + 150 * p.count / mx).toFixed(0)}px;background:${PALETTE[s.core.senders.indexOf(p.name) % PALETTE.length]}">${i === 0 ? "👑" : ""}</div></div>`).join("");
  return { top: t, html: `<div class="podium">${cols}</div>` };
}

// ---- chart / bar builders ----
function chapter(no, tr, en) {
  return { bg: "g-chapter", dur: 2200, html: () => `<div class="chapno pop">${no}</div><div class="chaptitle rise">${tx(tr, en)}</div>` };
}
function moodSVG(mood) {
  const pts = (mood || []).filter((m) => m[3] > 0);
  if (pts.length < 2) return "";
  const maxV = Math.max(1, ...pts.map((m) => Math.max(m[1], m[2])));
  const W = 300, H = 140, x = (i) => i * (W / (pts.length - 1)), y = (v) => H - (v / maxV) * H;
  const path = (k) => pts.map((m, i) => `${i ? "L" : "M"}${x(i).toFixed(0)},${y(m[k]).toFixed(0)}`).join(" ");
  return `<div class="chart"><svg viewBox="-4 -8 308 156"><path class="ln" d="${path(1)}" stroke="#ffd76a"/><path class="ln" d="${path(2)}" stroke="#ff5e62" style="animation-delay:.3s"/></svg>
    <div class="legend"><span><i class="dot" style="background:#ffd76a"></i>${tx("sıcaklık", "warmth")}</span><span><i class="dot" style="background:#ff5e62"></i>${tx("gerilim", "tension")}</span></div></div>`;
}
function barsHTML(rows) { // rows: [label, valueText, pct 0..100] → the .mbars bar list
  return `<div class="mbars">${rows.map(([label, val, pct]) => `<div class="m"><div class="lbl"><span>${label}</span><span>${val}</span></div><div class="track"><i style="--w:${Math.round(pct)}%"></i></div></div>`).join("")}</div>`;
}
function raceBars(s) {
  const [a, b] = s.core.senders, r = s.dynamics.reply_median_secs || {};
  const ra = r[a], rb = r[b];
  if (ra == null || rb == null) return null;
  const mn = (x) => (x < 60 ? `${x}${tx("sn", "s")}` : `${Math.round(x / 60)}${tx("dk", "m")}`), mx = Math.max(ra, rb, 1);
  const slow = ra > rb ? a : b;
  return `<div class="race">
    <div class="row"><div class="who"><span>${a}</span><span>${mn(ra)}</span></div><div class="bar"><i style="--w:${(100 * ra / mx).toFixed(0)}%"></i></div></div>
    <div class="row"><div class="who"><span>${b}</span><span>${mn(rb)}</span></div><div class="bar"><i style="--w:${(100 * rb / mx).toFixed(0)}%"></i></div></div></div>
    <div class="sub rise">${tx(`${slow} okuyup geç cevap veriyor 💀`, `${slow} reads it and replies late 💀`)}</div>`;
}

// ---- deck: story arc, no blocking input ----
// A "tease" is just a short auto-advancing drumroll slide before its reveal —
// the suspense of the old guess/pick slides without stealing the tap zones.
// Exported for test.mjs: html() templates are DOM-free (enter callbacks are not).
export function buildDeck(s) {
  const two = s.core.senders.length === 2;
  const owl = nightOwlTop(s.champions);
  const rating = s.scoring.chat_rating, label = s.scoring.chat_rating_label || "";
  const who = s.core.senders.join(" & ");
  const D = [];
  const tease = (bg, tr, en) => D.push({ bg, dur: 2000, enter: () => sfx.drum(),
    html: () => `<div class="emoji-hero pop">🥁</div><div class="head rise">${tx(tr, en)}</div>` });

  // ── cold open: no numbers — the report already leads with those ──
  D.push({ bg: "g-intro", dur: 3400, html: () => `<div class="rise" style="font-size:70px">🎬</div>
    <div class="head rise">${two ? who : `${s.core.senders.length} ${tx("kişilik grup", "-person group")}`}</div>
    <div class="sub rise">${tx("Bu, sizin hikâyeniz.", "This is your story.")} ✨</div>
    <div class="tag rise">${tx("başlamak için dokun", "tap to begin")}</div>` });

  // ── Chapter I · origins ──
  D.push(chapter("I", "Başlangıç", "Origins"));

  const qo = s.fun.quarter_openers?.[0];
  const fm = s.fun.first_message || (qo && qo.msgs?.[0]?.text ? { sender: qo.sender, text: qo.msgs[0].text, when: qo.when } : null);
  if (fm && fm.text) D.push({ bg: "g-first", dur: 5200,
    html: () => `<div class="kicker rise">${tx("Her şey bir mesajla başladı", "It all started with one message")}</div>
      <div class="quote rise">“${fm.text}”</div>
      <div class="sub rise">${fm.sender} — ${fmtDate(fm.when)}. ${tx("O zaman kim bilebilirdi 😌", "Who could've known 😌")}</div>` });

  D.push({ bg: "g-time", dur: 4400,
    html: () => `<div class="kicker rise">${tx("O günden beri", "Since that day")}</div>
      <div class="big rise"><span data-count="${s.core.span_days}">0</span><span style="font-size:.4em"> ${tx("gün", "days")}</span></div>
      <div class="sub rise">${tx(`geçti — ${s.core.active_days}'inde buradaydınız. Neredeyse hiç susmadınız 📆`, `went by — you showed up on ${s.core.active_days} of them. Barely ever quiet 📆`)}</div>` });

  const otd = s.fun.on_this_day;
  const otdMsg = otd?.years?.[0]?.msgs?.find((m) => m.text);
  if (otd && otdMsg) D.push({ bg: "g-first", dur: 4800, enter: () => emojiRain(["📅", "✨"]),
    html: () => `<div class="kicker rise">${tx("Bugün, geçmişte", "On this day")}</div>
      <div class="quote rise">“${otdMsg.text.slice(0, 90)}”</div>
      <div class="sub rise">${otdMsg.sender} — ${otd.years[0].year}. ${tx("Aynı gün, yıllar önce 🕰️", "Same day, years ago 🕰️")}</div>` });

  const streakDays = s.time.active_streak?.days ?? 0;
  if (streakDays > 1) D.push({ bg: "g-streak", dur: 4200,
    html: () => `<div class="kicker rise">${tx("En uzun seri", "Longest streak")}</div>
      <div class="big rise"><span data-count="${streakDays}">0</span><span style="font-size:.4em"> ${tx("gün", "days")}</span></div>
      <div class="sub rise">${tx("Tek gün atlamadan konuştunuz 🔥", "Not one day skipped 🔥")}</div>` });

  // ── Chapter II · the records ──
  D.push(chapter("II", "Rekorlar", "The Records"));

  const bd = s.time.busiest_day; // [dayKey, count]
  if (bd && bd[1] > 0) {
    tease("g-streak", `${fmtDate(dayFromKey(bd[0]))}'te bir şey oldu… 🌋`, `Something happened on ${fmtDate(dayFromKey(bd[0]))}… 🌋`);
    D.push({ bg: "g-streak", dur: 4600, enter: () => confettiBurst(40),
      html: () => `<div class="kicker rise">${tx("En çılgın gün", "Wildest day")}</div>
        <div class="big rise" data-odo="${bd[1]}">0</div>
        <div class="sub rise">${tx("mesaj — tek günde 😳", "messages — in a single day 😳")}</div>` });
  }

  const mc = s.fun.longest_convo;
  if (mc && mc.count > 0) D.push({ bg: "g-time", dur: 4400,
    html: () => `<div class="kicker rise">${tx("Maraton sohbet", "Marathon session")}</div>
      <div class="big rise"><span data-count="${mc.count}">0</span><span style="font-size:.4em"> ${tx("mesaj", "msgs")}</span></div>
      <div class="sub rise">${fmtDate(mc.from)} — ${tx("tek oturuşta, durmadan 🏃", "in one sitting, non-stop 🏃")}</div>` });

  const lm = s.fun.longest_message;
  if (lm && lm.chars > 0) D.push({ bg: "g-media", dur: 4800,
    html: () => `<div class="kicker rise">${tx("Kompozisyon rekoru", "The essay record")}</div>
      <div class="big rise" style="font-size:clamp(44px,14vw,84px)"><span data-count="${lm.chars}">0</span></div>
      <div class="sub rise">${tx(`${lm.sender} tek mesajda ${fmt(lm.chars)} karakter yazdı 📜 “${(lm.preview || "").slice(0, 60)}…”`, `${lm.sender} wrote ${fmt(lm.chars)} chars in one message 📜 “${(lm.preview || "").slice(0, 60)}…”`)}</div>` });

  const ln = s.fun.latest_night, lh = ln ? null : latestHour(s.champions);
  if (ln) D.push({ bg: "g-3am", dur: 4400,
    html: () => `<div class="kicker rise">${tx("Gece rekoru", "Latest hour")}</div>
      <div class="big rise">${hhmm(ln.when)}</div>
      <div class="sub rise">${tx(`En geç mesaj — ${ln.sender}: “${ln.text}” 🌙`, `Latest message — ${ln.sender}: “${ln.text}” 🌙`)}</div>` });
  else if (lh) D.push({ bg: "g-3am", dur: 4200,
    html: () => `<div class="kicker rise">${tx("Gece kuşu saati", "Peak night hour")}</div>
      <div class="big rise">${String(lh[1]).padStart(2, "0")}:00</div>
      <div class="sub rise">${tx(`${lh[0]} en çok bu saatte yazıyor 🌙`, `${lh[0]} texts most at this hour 🌙`)}</div>` });

  // ── Chapter III · signatures ──
  D.push(chapter("III", "İmzalar", "Signatures"));

  const te = s.fun.top_emoji?.[0];
  if (te) D.push({ bg: "g-emoji", dur: 4400, enter: () => emojiRain([te[0]]),
    html: () => `<div class="kicker rise">${tx("İmza emojiniz", "Signature emoji")}</div>
      <div class="emoji-hero pop">${te[0]}</div>
      <div class="head rise">${fmt(te[1])} ${tx("kez", "times")}</div>
      <div class="sub rise">${tx("Klavyende başka tuş kalmadı mı 😏", "Run out of other keys 😏")}</div>` });

  const sig = two ? sigWord(s) : null;
  if (sig) D.push({ bg: "g-word", dur: 4200,
    html: () => `<div class="kicker rise">${tx("İmza kelime", "Signature word")}</div>
      <div class="word pop">“${sig.w[0]}”</div>
      <div class="sub rise">${tx(`${sig.s} ${sig.w[1]} kez söyledi. Başka kelime yok mu 😅`, `${sig.s} said it ${sig.w[1]} times. Any other words 😅`)}</div>` });

  const sph = sigPhrase(s);
  if (sph) D.push({ bg: "g-word", dur: 4200,
    html: () => `<div class="kicker rise">${tx("İmza cümle", "Signature phrase")}</div>
      <div class="word pop" style="font-size:clamp(32px,10vw,60px)">“${sph.w[0]}”</div>
      <div class="sub rise">${tx(`${sph.s} bunu ${sph.w[1]} kez yazdı 💬`, `${sph.s} typed this ${sph.w[1]} times 💬`)}</div>` });

  // ── Chapter IV · award night ──
  D.push(chapter("IV", "Ödül Töreni", "Award Night"));

  if (two) {
    const [a, b] = s.core.senders, ft = s.champions.first_texter || {};
    const starter = (ft[a] ?? 0) >= (ft[b] ?? 0) ? a : b;
    D.push({ bg: "g-time", dur: 4600, enter: () => confettiBurst(30),
      html: () => `<div class="kicker rise">🏆 ${tx("Sessizlik Bozan ödülü", "The Ice-Breaker award")}</div>
        <div class="emoji-hero pop">📲</div><div class="head rise">${starter}</div>
        <div class="sub rise">${tx(`${ft[starter] ?? 0} kez ilk yazan o oldu 🤝`, `texted first ${ft[starter] ?? 0} times 🤝`)}</div>` });
  }

  const race = two ? raceBars(s) : null;
  if (race) {
    tease("g-race", "Sıradaki ödül: Kaplumbağa 🐢", "Next award: The Turtle 🐢");
    D.push({ bg: "g-race", dur: 5000,
      html: () => `<div class="kicker rise">🐢 ${tx("En yavaş cevap ödülü", "Slowest-reply award")}</div>
        <div class="head rise">${tx("İşte gerçek ⚡", "The truth ⚡")}</div>${race}` });
  }

  D.push({ bg: "g-owl", dur: 4200,
    html: () => `<div class="kicker rise">🦉 ${tx("Gece Kuşu ödülü", "The Night Owl award")}</div>
      <div class="emoji-hero pop">🦉</div>
      <div class="head rise">${owl[0]}</div>
      <div class="sub rise">${tx(`Mesajlarının %${owl[1]}'i gece yarısından sonra 🌙`, `%${owl[1]} of their messages after midnight 🌙`)}</div>` });

  if (two) {
    const [a, b] = s.core.senders, ts = s.dynamics.talk_share;
    D.push({ bg: "g-race", dur: 4800,
      html: () => `<div class="kicker rise">⚖️ ${tx("Konuşma dengesi", "Conversation balance")}</div>
        <div class="head rise">${tx("Mikrofon kimde? 🎤", "Who holds the mic? 🎤")}</div>
        ${barsHTML([[a, `%${ts[a]}`, ts[a]], [b, `%${ts[b]}`, ts[b]]])}` });
  } else {
    const pod = podiumHTML(s);
    D.push({ bg: "g-race", dur: 5200,
      html: () => `<div class="kicker rise">${tx("En çok konuşanlar", "Top talkers")}</div><div class="head rise">${tx("Grubun sesi 🎤", "The loud ones 🎤")}</div>${pod.html}
        <div class="sub rise">${tx(`${pod.top[0].name} açık ara — ${fmt(pod.top[0].count)} mesaj. Sus biraz`, `${pod.top[0].name} runaway — ${fmt(pod.top[0].count)} msgs. Chill`)}</div>` });
    const least = s.core.senders.map((x) => ({ name: x, share: s.dynamics.talk_share[x] })).sort((a, b) => a.share - b.share)[0];
    D.push({ bg: "g-owl", dur: 4200,
      html: () => `<div class="kicker rise">👻 ${tx("Hayalet ödülü", "The Ghost award")}</div>
        <div class="emoji-hero pop">👻</div><div class="head rise">${least.name}</div>
        <div class="sub rise">${tx(`Mesajların sadece %${least.share}'i. Yaşıyor musun 👻`, `Only %${least.share} of messages. Still alive 👻`)}</div>` });
  }

  // ── Chapter V · the feelings ──
  D.push(chapter("V", "Duygular", "The Feelings"));

  const lb = s.fun.love_bomb;
  if (lb) D.push({ bg: "g-love", dur: 4200,
    html: () => `<div class="emoji-hero pop">❤️</div><div class="head rise">${tx("Sevgi bombası günü", "Love-bomb day")}</div>
      <div class="sub rise">${fmtDate(lb.day)} — ${tx(`tek günde ${lb.count} sevgi mesajı 🥰`, `${lb.count} love messages in one day 🥰`)}</div>` });

  const [spice, flirts] = spiceLevel(s);
  if (flirts > 0) D.push({ bg: "g-spice", dur: 4400,
    html: () => `<div class="kicker rise">${tx("Baharat radarı", "Spice radar")}</div><div class="emoji-hero pop">🌶️</div>
      <div class="spice-meter" style="--w:${spice}%"><i></i></div>
      <div class="sub rise">${tx(`${flirts} flört sinyali. Oda ısındı 😳`, `${flirts} flirt signals. It got warm in here 😳`)}</div>` });

  const mood = moodSVG(s.time.mood);
  if (mood) D.push({ bg: "g-mood", dur: 5200,
    html: () => `<div class="kicker rise">${tx("Yıl boyunca ruh hali", "Mood across the year")}</div>
      <div class="head rise">${tx("İniş çıkışlar 📈", "The ups & downs 📈")}</div>${mood}` });

  // ── finale: only now the big totals — the payoff, not the opener ──
  const ms = topMilestone(s.milestones?.nth);
  if (ms) D.push({ bg: "g-mile", dur: 4000,
    html: () => `<div class="kicker rise">${tx("Kilometre taşı", "Milestone")}</div>
      <div class="big rise" style="font-size:clamp(46px,15vw,88px)">${fmt(ms[0])}</div>
      <div class="sub rise">${tx(`${fmt(ms[0])}. mesaj ${fmtDate(ms[1])}'te geldi 🎯`, `Message #${fmt(ms[0])} landed ${fmtDate(ms[1])} 🎯`)}</div>` });

  tease("g-volume", "Ve hepsini topladık… 🧮", "And we added it all up… 🧮");
  D.push({ bg: "g-volume", dur: 4800, enter: () => confettiBurst(),
    html: () => `<div class="kicker rise">${tx("Toplam mesaj", "Total messages")}</div>
      <div class="big rise" data-odo="${s.core.total}">0</div>
      <div class="sub rise">${tx("Bu kadar yazıştınız. Biraz hava alın 🤯", "You sent all these. Touch grass 🤯")}</div>` });

  const rt = relTitle(s); // reuse the report's relationship-title generator as the chat archetype
  D.push({ bg: "g-arch", dur: 5000,
    html: () => `<div class="kicker rise">${tx("Sohbet kişiliğiniz", "Your chat personality")}</div>
      <div class="head rise" style="font-size:clamp(30px,8vw,46px)">${tx(rt.tr, rt.en)}</div>
      <div class="sub rise">${tx("İşte tam olarak siz 🪞", "That's exactly you 🪞")}</div>` });

  // 3-2-1 countdown into the score — suspense without stealing the tap
  D.push({ bg: "g-final", dur: 2400, html: () => `<div class="count3">3</div>`,
    enter: () => { sfx.drum(); let n = 3;
      const iv = setInterval(() => { n--; const c = el(".count3"); if (!c || n < 1) return clearInterval(iv); c.textContent = n; buzz(20); }, 650); } });

  D.push({ bg: "g-final", dur: 5600, enter: () => confettiBurst(70),
    html: () => `<div class="kicker rise">${tx("Uyum puanınız", "Compatibility")}</div>
      <div class="big rise" data-odo="${rating}">0</div>
      ${label ? `<div class="tag rise" style="font-size:20px">${label}</div>` : ""}
      <div class="sub rise">${tx("100 üzerinden 💯", "Out of 100 💯")}</div>` });

  return D;
}

// ---- share / poster / caption ----
function toast(msg) { const t = el(".wtoast"); if (!t) return; t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1900); }
function captionText(s) {
  const rt = relTitle(s);
  return `${s.core.senders.join(" & ")} — ${fmt(s.core.total)} ${tx("mesaj", "messages")}, ${tx("uyum", "match")} ${s.scoring.chat_rating}/100 · ${tx(rt.tr, rt.en)} #WhatsAppWrapped`;
}
async function captureNode(node, filename, title) {
  if (!window.html2canvas) { toast(tx("Görsel motoru yüklenmedi", "Image engine not loaded")); return; }
  try {
    const canvas = await window.html2canvas(node, { backgroundColor: null, scale: 2, logging: false });
    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    const file = new File([blob], filename, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title, text: captionText(window.__stats) }); }
    else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); toast(tx("PNG indirildi 📥", "PNG downloaded 📥")); }
  } catch (e) { if (e?.name !== "AbortError") toast(tx("Paylaşılamadı", "Share failed")); }
}
function shareSlide() { const cur = el("#wcur"); if (!cur) return; pause(); captureNode(cur, "wrapped-slide.png", "WhatsApp Wrapped"); }
function posterHTML(s) {
  const rt = relTitle(s), te = s.fun.top_emoji?.[0]?.[0] ?? "—";
  const rows = [
    [tx("Toplam mesaj", "Messages"), fmt(s.core.total)],
    [tx("Aktif gün", "Active days"), fmt(s.core.active_days)],
    [tx("En uzun seri", "Streak"), `${s.time.active_streak?.days ?? 0} ${tx("gün", "days")}`],
    [tx("İmza emoji", "Top emoji"), te],
    [tx("Uyum", "Match"), `${s.scoring.chat_rating}/100`],
  ];
  return `<div class="pt">WhatsApp Wrapped</div><div class="pn">${s.core.senders.join(" & ")}</div>
    <div class="ptitle">${tx(rt.tr, rt.en)}</div>
    <div class="pbig">${fmt(s.core.total)}</div><div class="pbl">${tx("mesaj", "messages")}</div>
    ${rows.map((r) => `<div class="prow"><span>${r[0]}</span><b>${r[1]}</b></div>`).join("")}
    <div class="pfoot">whatsapp-stats</div>`;
}
function sharePoster() { const p = el("#wposter"); if (!p) return; p.innerHTML = posterHTML(window.__stats); captureNode(p, "wrapped-poster.png", "WhatsApp Wrapped"); }
function finish() {
  clearTimeout(timer); setTap(false); // end screen: taps shouldn't restart the deck
  const s = window.__stats;
  el(".wbars").style.visibility = "hidden";
  el(".wslides").innerHTML = `<div class="slide g-final on wend">
    <div class="kicker">${tx("İşte özetiniz", "Here's your recap")}</div>
    <div class="wendcard">${posterHTML(s)}</div>
    <div class="wendrow">
      <button class="wgbtn" id="wposterbtn">📸 ${tx("Poster", "Poster")}</button>
      <button class="wgbtn ghost" id="wreplaybtn">↺ ${tx("Tekrar", "Replay")}</button>
      <button class="wgbtn ghost" id="wclosebtn">${tx("Kapat", "Close")}</button>
    </div></div>`;
  el("#wposterbtn").addEventListener("click", sharePoster);
  el("#wreplaybtn").addEventListener("click", () => { el(".wbars").style.visibility = ""; show(0); });
  el("#wclosebtn").addEventListener("click", close);
}

// ---- engine ----
let SLIDES = [], idx = 0, timer = null, paused = false;
const TRANS = ["t-zoom", "t-wipe", "t-push"];
const el = (sel) => $w().querySelector(sel);
// tap-zones cover the screen; disabled only on the end card so its buttons get the tap.
function setTap(on) { const v = on ? "" : "none"; el(".wprev").style.pointerEvents = v; el(".wnext").style.pointerEvents = v; }

function buildBars() {
  const b = el(".wbars"); b.innerHTML = "";
  SLIDES.forEach(() => { const seg = document.createElement("div"); seg.className = "seg"; seg.innerHTML = "<i></i>"; b.appendChild(seg); });
}
function paintBars() {
  [...el(".wbars").children].forEach((seg, i) => {
    seg.className = "seg" + (i < idx ? " done" : "");
    const bar = seg.firstChild;
    if (i < idx) { bar.style.transition = "none"; bar.style.width = "100%"; }
    else if (i > idx) { bar.style.transition = "none"; bar.style.width = "0"; }
  });
}
function armBar(ms) {
  const seg = el(".wbars").children[idx].firstChild;
  seg.style.transition = "none"; seg.style.width = "0"; void seg.offsetWidth;
  seg.style.transition = `width ${ms}ms linear`; seg.style.width = "100%";
}
function arm(ms) { clearTimeout(timer); if (!paused) { armBar(ms); timer = setTimeout(() => show(idx + 1), ms); } }
function runEnter(def) {
  const cur = el("#wcur");
  cur.querySelectorAll("[data-odo]").forEach((n) => odometer(n, +n.dataset.odo));
  cur.querySelectorAll("[data-count]").forEach((n) => countUp(n, +n.dataset.count));
  if (def.enter) setTimeout(def.enter, 350);
}

function show(i) {
  clearTimeout(timer);
  if (i < 0) i = 0;
  if (i >= SLIDES.length) return finish();
  idx = i; setTap(true);
  const def = SLIDES[i];
  el(".wfx").innerHTML = "";
  el(".wslides").innerHTML = `<div class="slide ${def.bg} ${TRANS[i % 3]}" id="wcur"></div>`;
  const cur = el("#wcur"); sfx.whoosh();
  cur.innerHTML = def.html(); void cur.offsetWidth; cur.classList.add("on");
  runEnter(def); paintBars(); arm(def.dur);
}

const next = () => show(idx + 1);
const prev = () => show(idx - 1);
function pause() { paused = true; clearTimeout(timer); const seg = el(".wbars").children[idx]?.firstChild; if (seg) { const w = getComputedStyle(seg).width; seg.style.transition = "none"; seg.style.width = w; } }
function resume() { if (!paused) return; paused = false; arm(2500); }

function open() {
  const s = window.__stats; if (!s) return;
  lang = window.__lang === "en" ? "en" : "tr";
  ensureAudio(); // launch click is the user gesture that unlocks Web Audio
  SLIDES = buildDeck(s); idx = 0; paused = false;
  const root = $w();
  root.innerHTML = `<div class="wphone">
    <div class="wgrain"></div>
    <div class="wbrand"><b>WhatsApp</b> Wrapped</div>
    <div class="wchrome">
      <button class="wmute" title="${tx("ses", "sound")}">${muted ? "🔇" : "🔊"}</button>
      <button class="wclose" title="${tx("kapat", "close")}">✕</button>
    </div>
    <div class="wbars"></div>
    <div class="wfx"></div>
    <div class="wslides"></div>
    <div class="wtap wprev"></div>
    <div class="wtap wnext"></div>
    <button class="wshare" title="${tx("kartı paylaş", "share card")}">📤</button>
    <div class="whint">${tx("◀ geri · ileri ▶ · basılı tut = duraklat", "◀ back · next ▶ · hold = pause")}</div>
    <div class="wtoast"></div>
    <div class="wposter-wrap"><div class="wposter" id="wposter"></div></div>
  </div>`;
  root.classList.remove("hidden");
  // wiring
  el(".wclose").addEventListener("click", close);
  el(".wmute").addEventListener("click", () => setMuted(!muted));
  el(".wshare").addEventListener("click", shareSlide);
  el(".wnext").addEventListener("click", next);
  el(".wprev").addEventListener("click", prev);
  let hold = null;
  [".wnext", ".wprev"].forEach((sel) => {
    const z = el(sel);
    z.addEventListener("pointerdown", () => { hold = setTimeout(pause, 250); });
    z.addEventListener("pointerup", () => { clearTimeout(hold); if (paused) resume(); });
    z.addEventListener("pointerleave", () => clearTimeout(hold));
  });
  buildBars(); show(0);
}
function close() {
  clearTimeout(timer);
  // tear the whole AudioContext down — guarantees silence after close; reopens on next launch
  if (AC) { try { AC.close(); } catch (e) { /* already closed */ } AC = null; masterGain = null; }
  const root = $w(); root.classList.add("hidden"); root.innerHTML = "";
}
if (typeof document !== "undefined") { // skipped under node (test.mjs imports buildDeck)
  document.addEventListener("keydown", (e) => {
    if ($w().classList.contains("hidden")) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight" || e.key === " ") next();
    else if (e.key === "ArrowLeft") prev();
  });

  // ---- mount launch button into the share bar ----
  const shareBar = document.getElementById("share");
  if (shareBar) {
    const b = document.createElement("button");
    b.className = "wrapped-launch";
    b.textContent = "🎁 Wrapped";
    b.addEventListener("click", open);
    shareBar.prepend(b);
  }
}
