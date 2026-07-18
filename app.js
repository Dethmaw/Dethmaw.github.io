// App shell: import a WhatsApp export → parse + compute on-device → render the one-pager.
import { readChat } from "./parse.js";
import { computeStats } from "./stats.js";
import { reportHTML, personHTML, PALETTE } from "./render.js";
import { saveChat, listChats, getChat, deleteChat } from "./history.js";
import { shareCard } from "./share.js"; // mounts the share-bar controls + single-card share

const $ = (id) => document.getElementById(id);
const importEl = $("import"), dropEl = $("drop"), busyEl = $("busy"), errEl = $("err");
const reportEl = $("report"), shareEl = $("share"), filterEl = $("filter"), historyEl = $("history"), trackerEl = $("tracker");

const show = (el) => el.classList.remove("hidden");
const hide = (el) => el.classList.add("hidden");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Language: report/deep-dive strings live in render.js LABELS; app-chrome strings here.
let LANG = localStorage.getItem("wa-lang") === "en" ? "en" : "tr";
window.__lang = LANG; // read by share.js for PNG/download
const UI = {
  tr: {
    all: "Tümü", custom: "Özel…", apply: "Uygula", back: "← Geri", noRange: "Seçilen aralıkta mesaj yok.",
    saved: "Kayıtlı sohbetler", err: "Sohbet okunamadı — geçerli bir WhatsApp .zip veya _chat.txt dosyası seç.",
    trackTitle: "🔎 Kelime takibi", trackPh: "Bir kelime veya ifade ara…",
    trackOcc: "kez", trackMsgs: "mesajda", trackNone: "Eşleşme yok.", trackFirst: "İlk", trackLast: "Son",
    person: "Kişi", anonTitle: "İsimleri gizle", guideTitle: "Sohbeti nasıl dışa aktarırım?",
    convoTitle: "En uzun sohbet", memContextTitle: "Bağlam",
    guide: "<li>WhatsApp'ta sohbeti aç.</li><li>Kişi ya da grup adına dokun.</li><li>Aşağı in → <b>Sohbeti Dışa Aktar</b>.</li><li>“Medya olmadan” (daha küçük) ya da “Medyalı” seç.</li><li>Oluşan <b>.zip</b> dosyasını buraya bırak.</li>",
    title: "Sohbet İstatistikleri",
    desc: 'WhatsApp sohbetini <b>.zip</b> olarak dışa aktar ve buraya bırak. Her şey telefonunda işlenir — hiçbir veri hiçbir yere yüklenmez.',
    pick: "Sohbet .zip dosyasını seç", drag: "veya buraya sürükle", busy: "İşleniyor…",
    install: "⬇ Uygulamayı Yükle",
  },
  en: {
    all: "All", custom: "Custom…", apply: "Apply", back: "← Back", noRange: "No messages in the selected range.",
    saved: "Saved chats", err: "Couldn't read the chat — pick a valid WhatsApp .zip or _chat.txt file.",
    trackTitle: "🔎 Keyword tracker", trackPh: "Search a word or phrase…",
    trackOcc: "times", trackMsgs: "messages", trackNone: "No matches.", trackFirst: "First", trackLast: "Last",
    person: "Person", anonTitle: "Hide names", guideTitle: "How do I export my chat?",
    convoTitle: "Longest conversation", memContextTitle: "Context",
    guide: "<li>Open the chat in WhatsApp.</li><li>Tap the contact or group name.</li><li>Scroll down → <b>Export Chat</b>.</li><li>Pick “Without media” (smaller) or “With media”.</li><li>Drop the resulting <b>.zip</b> here.</li>",
    title: "Chat Statistics",
    desc: 'Export your WhatsApp chat as a <b>.zip</b> and drop it here. Everything is processed on your phone — nothing is uploaded anywhere.',
    pick: "Choose chat .zip file", drag: "or drag it here", busy: "Processing…",
    install: "⬇ Install App",
  },
};
const ui = () => UI[LANG];

let allMessages = [];      // full parsed set, kept so the date filter can re-slice without re-importing
let currentMessages = [];  // the real slice currently shown (source of truth for re-renders)
let displayMessages = [];  // the slice actually rendered/searched (anonymized when ANON is on)
let ANON = false;          // privacy: replace names with "Kişi 1/2…" everywhere (report + share + tracker)

// Replace each sender with a stable generic label so the report can be shared without exposing names.
function anonymize(messages) {
  const map = {}; let i = 0;
  for (const s of [...new Set(messages.map((m) => m.sender))].sort()) map[s] = `${ui().person} ${++i}`;
  return messages.map((m) => ({ ...m, sender: map[m.sender] }));
}

// Compute + render the report for a message slice; also refreshes window.__stats (share/deep-dive).
// Anonymization happens at the source (rename senders → recompute), so every downstream view —
// report, per-person deep-dive, share text, and the keyword tracker — is anonymized automatically.
function renderReport(messages) {
  currentMessages = messages;
  displayMessages = ANON ? anonymize(messages) : messages;
  const stats = computeStats(displayMessages);
  window.__stats = stats;
  reportEl.innerHTML = reportHTML(stats, LANG);
  // Single-card share: decorate each section with a 📷 button (app-only, so it never lands in the
  // full-report PNG/download, which re-render from clean reportHTML).
  for (const sec of reportEl.querySelectorAll("section"))
    sec.insertAdjacentHTML("beforeend", '<button class="cardshare" type="button" title="Kart olarak paylaş">📷</button>');
  reportBlocks = [...reportEl.children]; // flat blocks (head, sections…, foot) for the JS masonry
  lastCols = 0;
  layoutReport();
  const inp = $("trInput"); // keep keyword results in sync with the shown slice
  if (inp && inp.value.trim()) renderTrackerResults(inp.value);
}

// JS masonry: place sections into fixed columns (shortest-first) so an expanding <details> only
// grows its own column — CSS multicol reshuffles the whole grid on any height change. Head/foot
// span full width. Re-runs only when the column count actually changes (preserves expanded state).
let reportBlocks = [], lastCols = 0;
function layoutReport() {
  if (reportEl.classList.contains("hidden") || !reportBlocks.length) return;
  const cols = Math.max(1, Math.min(4, Math.floor(reportEl.clientWidth / 330)));
  if (cols === lastCols) return;
  lastCols = cols;
  reportEl.classList.toggle("mz", cols > 1);
  reportEl.textContent = "";
  const head = reportBlocks[0], foot = reportBlocks[reportBlocks.length - 1];
  const middle = reportBlocks.slice(1, -1);
  reportEl.appendChild(head);
  if (cols <= 1) { middle.forEach((b) => reportEl.appendChild(b)); reportEl.appendChild(foot); return; }
  const wrap = document.createElement("div");
  wrap.className = "mzwrap";
  const columns = Array.from({ length: cols }, () => wrap.appendChild(document.createElement("div"))).map((c) => (c.className = "mzcol", c));
  reportEl.appendChild(wrap);
  for (const b of middle) columns.reduce((a, c) => (c.offsetHeight < a.offsetHeight ? c : a)).appendChild(b);
  reportEl.appendChild(foot);
}
let resizeTimer = null;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layoutReport, 150); });

const yearsOf = (msgs) => [...new Set(msgs.map((m) => m.when.getFullYear()))].sort();

function buildFilter() {
  const years = yearsOf(allMessages);
  if (years.length <= 1) { filterEl.innerHTML = ""; hide(filterEl); return; }
  const chip = (label, attr) => `<button class="fchip" ${attr}>${label}</button>`;
  filterEl.innerHTML =
    `<div class="frow"><button class="fchip on" data-year="all">${ui().all}</button>` +
    years.map((y) => chip(y, `data-year="${y}"`)).join("") +
    chip(ui().custom, `data-custom="1"`) + `</div>` +
    `<div class="fcustom hidden"><input type="date" id="fFrom"> – <input type="date" id="fTo"> ` +
    `<button class="fchip" id="fApply">${ui().apply}</button></div>`;
  show(filterEl);
}

function markActive(key) {
  filterEl.querySelectorAll(".fchip[data-year],.fchip[data-custom]")
    .forEach((b) => b.classList.toggle("on", b.dataset.year === key || (key === "custom" && b.dataset.custom)));
}

function applyYear(val) {
  const msgs = val === "all" ? allMessages : allMessages.filter((m) => m.when.getFullYear() === +val);
  if (!msgs.length) return;
  renderReport(msgs);
  markActive(val);
  window.scrollTo(0, 0);
}

function applyRange() {
  const from = $("fFrom").value, to = $("fTo").value;
  const a = from ? new Date(from) : null;
  const b = to ? new Date(to + "T23:59:59") : null;
  const msgs = allMessages.filter((m) => (!a || m.when >= a) && (!b || m.when <= b));
  if (!msgs.length) { errEl.textContent = ui().noRange; return; }
  errEl.textContent = "";
  renderReport(msgs);
  markActive("custom");
  window.scrollTo(0, 0);
}

filterEl.addEventListener("click", (e) => {
  const y = e.target.closest("[data-year]");
  if (y) return applyYear(y.dataset.year);
  if (e.target.closest("[data-custom]")) return filterEl.querySelector(".fcustom").classList.toggle("hidden");
  if (e.target.id === "fApply") return applyRange();
});

// ── keyword tracker (app-only: live substring search over the shown message slice) ──
// Not a computed stat — a client-side tool, so it isn't in stats.js/parity. "Who says it & when".
function trackSearch(q) {
  q = q.trim().toLowerCase();
  if (!q) return null;
  const senders = [...new Set(displayMessages.map((m) => m.sender))].sort();
  const per = Object.fromEntries(senders.map((s) => [s, 0]));
  const byMonth = new Map();
  let occ = 0, msgs = 0, first = null, last = null;
  const samples = [];
  for (const m of displayMessages) {
    if (!m.text) continue;
    const low = m.text.toLowerCase();
    if (!low.includes(q)) continue;
    const n = low.split(q).length - 1; // occurrences in this message
    occ += n; msgs += 1; per[m.sender] += n;
    first ??= m.when; last = m.when; // messages are oldest-first
    const mk = `${m.when.getFullYear()}-${String(m.when.getMonth() + 1).padStart(2, "0")}`;
    byMonth.set(mk, (byMonth.get(mk) ?? 0) + n);
    if (samples.length < 3) samples.push(m);
  }
  return occ ? { occ, msgs, per, senders, byMonth, first, last, samples } : { occ: 0 };
}

function renderTrackerResults(q) {
  const res = trackerEl.querySelector(".trackres");
  if (!res) return;
  const query = q.trim();
  if (!query) { res.innerHTML = ""; return; }
  const r = trackSearch(query);
  if (!r.occ) { res.innerHTML = `<div class="trnone">${ui().trackNone}</div>`; return; }
  const color = Object.fromEntries(r.senders.map((s, i) => [s, PALETTE[i % PALETTE.length]]));
  const max = Math.max(1, ...r.senders.map((s) => r.per[s]));
  const nf = (n) => n.toLocaleString("en-US");
  const bars = r.senders.filter((s) => r.per[s] > 0).sort((a, b) => r.per[b] - r.per[a]).map((s) =>
    `<div class="trbar"><span class="trname" style="color:${color[s]}">${esc(s)}</span>` +
    `<span class="trtrack"><i style="width:${(100 * r.per[s] / max).toFixed(1)}%;background:${color[s]}"></i></span>` +
    `<b>${nf(r.per[s])}</b></div>`).join("");
  const months = [...r.byMonth.entries()];
  const mmax = Math.max(1, ...months.map(([, n]) => n));
  const spark = months.map(([k, n]) => `<i style="height:${Math.max(6, 100 * n / mmax).toFixed(1)}%" title="${k} · ${n}"></i>`).join("");
  const fmt = (d) => d.toLocaleDateString(LANG === "tr" ? "tr-TR" : "en-US", { day: "numeric", month: "short", year: "numeric" });
  const ql = query.toLowerCase();
  const samples = r.samples.map((m) => {
    const i = m.text.toLowerCase().indexOf(ql), start = Math.max(0, i - 28);
    const snip = (start ? "…" : "") + m.text.slice(start, i + ql.length + 40) + (i + ql.length + 40 < m.text.length ? "…" : "");
    return `<div class="trsample"><span style="color:${color[m.sender] ?? PALETTE[0]}">${esc(m.sender)}</span> ${esc(snip)}</div>`;
  }).join("");
  res.innerHTML =
    `<div class="trsum"><b>${nf(r.occ)}</b> ${ui().trackOcc} · <b>${nf(r.msgs)}</b> ${ui().trackMsgs}</div>` +
    `<div class="trbars">${bars}</div>` +
    (months.length > 1 ? `<div class="trspark">${spark}</div>` : "") +
    `<div class="trdates">${ui().trackFirst}: ${fmt(r.first)} · ${ui().trackLast}: ${fmt(r.last)}</div>` +
    `<div class="trsamples">${samples}</div>`;
}

let trackTimer = null;
function buildTracker(keepValue = "") {
  trackerEl.innerHTML =
    `<div class="trhead">${ui().trackTitle}</div>` +
    `<input type="search" id="trInput" class="trinput" placeholder="${esc(ui().trackPh)}" autocomplete="off">` +
    `<div class="trackres"></div>`;
  show(trackerEl);
  const inp = $("trInput");
  inp.addEventListener("input", () => { clearTimeout(trackTimer); trackTimer = setTimeout(() => renderTrackerResults(inp.value), 180); });
  if (keepValue) { inp.value = keepValue; renderTrackerResults(keepValue); }
}

// A .zip starts with the local-file-header magic "PK" (0x50 0x4b); otherwise treat as raw _chat.txt.
const looksZip = (file, bytes) =>
  file.name.toLowerCase().endsWith(".zip") || (bytes[0] === 0x50 && bytes[1] === 0x4b);

// Parse bytes → render; shared by a fresh import (save=true) and reopening from history (save=false).
async function loadBytes(bytes, isZip, save, name) {
  errEl.textContent = "";
  hide(dropEl);
  show(busyEl);
  try {
    const messages = await readChat(bytes, isZip);
    if (!messages.length) throw new Error("no messages parsed");
    allMessages = messages;
    renderReport(messages);
    buildFilter();
    buildTracker();
    hide(importEl);
    show(reportEl);
    show(shareEl);
    show($("anontoggle"));
    layoutReport(); // reportEl now has a real width → lay out the columns properly
    window.scrollTo(0, 0);
    if (save) {
      try { await saveChat(name, bytes, isZip); } catch (e) { console.warn("history save failed:", e); }
    }
  } catch (e) {
    console.error(e);
    hide(busyEl);
    show(dropEl);
    errEl.textContent = ui().err;
  }
}

async function handle(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  loadBytes(bytes, looksZip(file, bytes), true, file.name);
}

$("file").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) handle(f); });

// ── local history (saved chats on the import screen) ──
async function renderHistory() {
  const chats = await listChats().catch(() => []);
  if (!chats.length) { historyEl.innerHTML = ""; hide(historyEl); return; }
  historyEl.innerHTML = `<div class="hhead">${ui().saved}</div>` + chats.map((c) =>
    `<div class="hitem" data-open="${c.id}"><span class="hname">${esc(c.name)}</span>` +
    `<span class="hmeta">${new Date(c.date).toLocaleDateString("tr-TR")} · ${Math.round(c.size / 1024)} KB</span>` +
    `<button class="hdel" data-del="${c.id}" title="Sil">✕</button></div>`).join("");
  show(historyEl);
}

historyEl.addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del]");
  if (del) { e.stopPropagation(); await deleteChat(+del.dataset.del); renderHistory(); return; }
  const open = e.target.closest("[data-open]");
  if (open) { const rec = await getChat(+open.dataset.open); if (rec) loadBytes(new Uint8Array(rec.bytes), rec.isZip, false); }
});

// ── language toggle ──
function applyLang(next) {
  LANG = next;
  window.__lang = next;
  localStorage.setItem("wa-lang", next);
  document.documentElement.lang = next;
  $("langtoggle").textContent = next === "tr" ? "EN" : "TR";
  const u = ui();
  $("iTitle").textContent = u.title;
  $("iDesc").innerHTML = u.desc;
  $("iPick").textContent = u.pick;
  $("iDrag").textContent = u.drag;
  $("iBusy").textContent = u.busy;
  const ib = $("installbtn"); if (ib) ib.textContent = u.install;
  $("anontoggle").title = u.anonTitle;
  $("guide").innerHTML = `<summary>${u.guideTitle}</summary><ol class="gsteps">${u.guide}</ol>`;
  renderHistory();
  if (!reportEl.classList.contains("hidden") && currentMessages.length) {
    renderReport(currentMessages); buildFilter();
    if (!trackerEl.classList.contains("hidden")) buildTracker($("trInput")?.value ?? "");
  }
  document.querySelectorAll(".overlay").forEach((ov) => {
    ov.querySelector(".oback").textContent = u.back;
    ov.querySelector(".report").innerHTML = personHTML(window.__stats, ov.dataset.sender, LANG);
  });
}
$("langtoggle").addEventListener("click", () => applyLang(LANG === "tr" ? "en" : "tr"));

// ── PWA install affordance ──
// Chromium fires `beforeinstallprompt` when the app is installable; capture it and reveal an
// "Install app" button on the import screen, then trigger the native prompt on tap. iOS emits no
// such event (add-to-home-screen is manual) and a standalone launch never fires it, so the button
// stays hidden there. Its label is set by applyLang (runs just below).
let deferredPrompt = null;
const installBtn = document.createElement("button");
installBtn.id = "installbtn";
installBtn.className = "installbtn hidden";
installBtn.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null; // a prompt can be used once
  hide(installBtn);
});
importEl.appendChild(installBtn);
const isStandalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!isStandalone) show(installBtn);
});
window.addEventListener("appinstalled", () => { deferredPrompt = null; hide(installBtn); });

// Privacy: toggle name anonymization and re-render everything from the real slice.
$("anontoggle").addEventListener("click", () => {
  ANON = !ANON;
  $("anontoggle").classList.toggle("on", ANON);
  if (currentMessages.length) { renderReport(currentMessages); window.scrollTo(0, 0); }
});

// Color themes (cosmetic): cycle classic → sunset → ocean → mono, persisted.
const THEMES = ["classic", "sunset", "ocean", "mono"];
let theme = localStorage.getItem("wa-theme") || "classic";
function applyTheme(t) {
  theme = THEMES.includes(t) ? t : "classic";
  if (theme === "classic") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = theme;
  localStorage.setItem("wa-theme", theme);
}
applyTheme(theme);
$("themetoggle").addEventListener("click", () => applyTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]));

applyLang(LANG); // set initial chrome text + toggle label; also renders history

// Drag-and-drop anywhere on the import screen.
for (const ev of ["dragenter", "dragover"]) importEl.addEventListener(ev, (e) => { e.preventDefault(); dropEl.classList.add("hot"); });
for (const ev of ["dragleave", "drop"]) importEl.addEventListener(ev, (e) => { e.preventDefault(); dropEl.classList.remove("hot"); });
importEl.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) handle(f); });

// ── per-person deep-dive overlay ──
function openPerson(sender) {
  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.dataset.sender = sender;
  ov.innerHTML =
    `<div class="obar"><button class="oback">${ui().back}</button></div>` +
    `<div class="report">${personHTML(window.__stats, sender, LANG)}</div>`;
  ov.querySelector(".oback").addEventListener("click", () => ov.remove());
  document.body.appendChild(ov);
  ov.scrollTop = 0;
}

// Delegate: tapping any [data-person] (an avatar or a Kişiler chip) opens that person's deep-dive.
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-person]");
  if (t && window.__stats) openPerson(t.getAttribute("data-person"));
});

// Single-card share: 📷 on a section shares just that card as an image.
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".cardshare");
  if (!btn) return;
  const sec = btn.closest("section");
  if (sec) shareCard(sec);
});

// Read-only conversation popup (reuses the deep-dive overlay). Renders a list of messages as
// bubbles — used by longest-conversation "see full" and random-memory "see context".
function openConvo(msgs, title) {
  const senders = window.__stats?.core.senders ?? [];
  const colorOf = (s) => PALETTE[senders.indexOf(s) % PALETTE.length] ?? PALETTE[0];
  const bubbles = msgs.map((m) => {
    const body = m.media ? `<span class="qmedia">📎 ${esc(m.media)}</span>${m.text ? " " + esc(m.text) : ""}` : (esc(m.text) || "—");
    return `<div class="qmsg"><span class="qwho" style="color:${colorOf(m.sender)}">${esc(m.sender)}</span> ${body}</div>`;
  }).join("");
  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.innerHTML = `<div class="obar"><button class="oback">${ui().back}</button><span class="otitle">${esc(title)}</span></div>` +
    `<div class="report"><section><div class="qexpand" style="padding-left:0">${bubbles}</div></section></div>`;
  ov.querySelector(".oback").addEventListener("click", () => ov.remove());
  document.body.appendChild(ov);
  ov.scrollTop = 0;
}

// Random memory shuffle + "see context"; longest-conversation "see full".
const fmtMemDate = (d) => new Date(d).toLocaleDateString(LANG === "tr" ? "tr-TR" : "en-US", { day: "numeric", month: "short", year: "numeric" });

// Shuffle-cursor over the memory pool: every memory shows once before any repeats, then reshuffle.
// memLast (seeded to 0, the index the render shows initially) blocks an immediate repeat across the
// reshuffle boundary too — so no two consecutive shows collide unless the pool has a single item.
let memOrder = null, memAt = 0, memLast = 0;
const shuffleIdx = (n) => {
  const a = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  if (n > 1 && a[0] === memLast) [a[0], a[1]] = [a[1], a[0]];
  return a;
};
function nextMemory(mems) {
  if (!memOrder || memOrder.length !== mems.length || memAt >= memOrder.length) { memOrder = shuffleIdx(mems.length); memAt = 0; }
  memLast = memOrder[memAt++];
  return mems[memLast];
}
document.addEventListener("click", (e) => {
  const shuf = e.target.closest(".memshuffle");
  if (shuf) {
    const wrap = shuf.closest(".memwrap"), card = wrap?.querySelector(".memcard");
    const mems = window.__stats?.fun?.memories ?? [];
    if (!mems.length || !card) return;
    const senders = window.__stats.core.senders;
    const m = nextMemory(mems);
    const color = PALETTE[senders.indexOf(m.sender) % PALETTE.length] ?? PALETTE[0];
    card.innerHTML = `<span class="qwho" style="color:${color}">${esc(m.sender)}</span> ${esc(m.text)}<div class="memdate">${fmtMemDate(m.when)}</div>`;
    wrap.dataset.when = +new Date(m.when);
    return;
  }
  const ctx = e.target.closest(".memcontext");
  if (ctx) {
    const when = +ctx.closest(".memwrap").dataset.when;
    const idx = displayMessages.findIndex((m) => +m.when === when);
    if (idx >= 0) openConvo(displayMessages.slice(Math.max(0, idx - 4), idx + 5), ui().memContextTitle);
    return;
  }
  const full = e.target.closest(".seefull");
  if (full) {
    const from = +full.dataset.from, to = +full.dataset.to;
    openConvo(displayMessages.filter((m) => +m.when >= from && +m.when <= to), ui().convoTitle);
  }
});

// Interactive activity chart: hovering/tapping a bar shows that month + count in the readout.
function sparkShow(e) {
  const bar = e.target.closest(".spark i");
  if (!bar) return;
  const read = bar.closest("section")?.querySelector(".sparkread");
  if (read) read.textContent = `${bar.dataset.m} · ${bar.dataset.n}`;
  bar.parentElement.querySelectorAll("i.on").forEach((b) => b.classList.remove("on"));
  bar.classList.add("on");
}
document.addEventListener("pointerover", sparkShow);
document.addEventListener("pointerdown", sparkShow);
// Leaving the chart entirely restores the default (date-range) readout and clears the highlight.
document.addEventListener("pointerout", (e) => {
  const spark = e.target.closest(".spark");
  if (!spark || spark.contains(e.relatedTarget)) return; // still moving within the chart
  const read = spark.closest("section")?.querySelector(".sparkread");
  if (read) read.textContent = read.dataset.def ?? "";
  spark.querySelectorAll("i.on").forEach((b) => b.classList.remove("on"));
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") document.querySelector(".overlay:last-of-type")?.remove();
});

// Register the service worker so the app is installable and works offline.
// When an updated worker takes control, reload once so fresh code is used immediately
// (prevents the app running stale cached JS after an update).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.error));
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}
