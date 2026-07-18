// Build the Mimoto-style one-pager HTML from a computeStats() result. Pure string building
// (no DOM), so it runs in the browser and in the Node parity test. Bilingual (tr/en) via LABELS;
// the stats layer stays language-neutral (render derives day/block/rating strings by index/score).

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const nf = (n) => Number(n).toLocaleString("en-US");
// Compact count for tight cells (heatmap): 1234→"1.2k", 12345→"12k", 123456→"123k". Keeps ≤4 chars
// so large chats don't overflow/wrap the fixed heatmap grid; full value stays in the cell title.
export const kfmt = (n) => (n >= 100000 ? Math.round(n / 1000) + "k" : n >= 10000 ? (n / 1000).toFixed(0) + "k" : n >= 1000 ? (n / 1000).toFixed(1) + "k" : nf(n));
const initial = (name) => [...name.trim()][0]?.toUpperCase() ?? "?";

function hms(s) { // reply times, language-neutral mm:ss
  if (s == null) return "—";
  s = Math.round(s);
  const m = Math.floor(s / 60), ss = s % 60;
  return `${m}:${String(ss).padStart(2, "0")}`;
}

const MONTHS = {
  tr: ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
const fmtDate = (d, lang) => `${d.getDate()} ${MONTHS[lang][d.getMonth()]} ${d.getFullYear()}`;
const hour2 = (h) => (h == null ? "—" : `${String(h).padStart(2, "0")}:00`);

function humanSpan(a, b, lang) {
  let y = b.getFullYear() - a.getFullYear();
  let mo = b.getMonth() - a.getMonth();
  let d = b.getDate() - a.getDate();
  if (d < 0) { mo--; d += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); }
  if (mo < 0) { y--; mo += 12; }
  const u = lang === "en" ? ["y", "m", "d"] : ["y", "a", "g"];
  return [y && `${y}${u[0]}`, mo && `${mo}${u[1]}`, `${d}${u[2]}`].filter(Boolean).join(" ");
}

function humanDur(s, lang) {
  s = Math.round(s);
  const u = lang === "en" ? ["min", "hr", "days"] : ["dk", "sa", "gün"];
  if (s < 3600) return `${Math.round(s / 60)} ${u[0]}`;
  if (s < 86400) return `${Math.round(s / 3600)} ${u[1]}`;
  return `${Math.round(s / 86400)} ${u[2]}`;
}
const dayFromKey = (k) => { const [y, mo, d] = k.split("-").map(Number); return new Date(y, mo, d); };

export const PALETTE = ["#2ecc71", "#ff5d5d", "#53b1fd", "#f5a623", "#b06fe6", "#2ec5c5", "#e6547a", "#8bc34a"];
const num = (v) => (typeof v === "number" ? v : Number.parseFloat(v) || 0);
const MEDIA_IC = { image: "🖼️", video: "🎥", audio: "🎤", gif: "🎞️", sticker: "🏷️", document: "📄", contact: "👤" };
const ratingBucket = (score) => (score >= 80 ? 4 : score >= 60 ? 3 : score >= 40 ? 2 : score >= 20 ? 1 : 0);

// All display strings, per language. The stats layer holds no user-facing text beyond names.
export const LABELS = {
  tr: {
    days: ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"],
    blocks: ["Sabaha karşı", "Sabah", "Öğleden sonra", "Akşam", "Gece"],
    media: { image: "Görsel", video: "Video", audio: "Ses", gif: "GIF", sticker: "Çıkartma", document: "Belge", contact: "Kişi" },
    ratings: ["Sessiz bir ilişki", "İdare eder bir ilişki", "İyi bir ilişki", "Çok iyi bir ilişki", "Mükemmel bir ilişki"],
    points: "Sohbet puanı", duration: "Süre", messages: "Mesaj", conversations: "Konuşma", activeDays: "aktif gün",
    pointsSuffix: "sohbet puanı", msgWord: "mesaj", pointWord: "puan", convWord: "konuşma",
    people: "Kişiler", peopleHint: "detay için dokun",
    activity: "Zaman içinde aktivite", rating: "Sohbet puanı", insights: "Öne çıkanlar",
    phrases: "Sık kullanılan ifadeler",
    mood: "Ruh hali", moodHint: "sıcaklık – gerginlik", moodWarm: "En sıcak", moodTense: "En gergin",
    compat: "Uyum", rpBalance: "Denge", rpRecip: "Karşılıklılık", rpConsistency: "Süreklilik", rpEngagement: "Yoğunluk",
    longestConvo: "En uzun sohbet", convoMsgs: "mesaj", seeFull: "Tümünü gör", seeContext: "Bağlamı gör",
    randomMemory: "Rastgele anı", memShuffle: "🎲 Başka", memRemember: "bunu hatırlıyor musun?",
    ghosting: "Okundu bırakma", ghostMost: (name) => `En çok okundu bırakan: <b>${name}</b>`, ghostLeft: "Yüzüstü kalan soru",
    replyTrend: "Yanıt süresi trendi", replyTrendHint: "medyan · dk:sn", replyFast: "En hızlı", replySlow: "En yavaş",
    awards: "Ödüller", awNight: "Gece kuşu", awLaugh: "Kahkaha şampiyonu", awQuestion: "Soru canavarı",
    awApology: "Özür ustası", awMedia: "Medya kralı", awLast: "Son sözcü", awFirst: "Erkenci",
    awDouble: "Peş peşe atan", awLove: "Aşık", awSwear: "Küfürbaz", awEssay: "Kompozisyoncu", awFast: "Yıldırım yanıt",
    wrapped: "Özet kart", wrappedRating: "uyum", wrappedBusiest: "en yoğun gün", wrappedStreak: "en uzun seri", wrappedTopEmoji: "favori emoji",
    reportCard: "Sohbet karnesi", reportCardHint: "50 = ortalama sohbet · altı/üstü ilişkiye göre",
    scAffection: "Sevgi", scFlirt: "Flört", scPositivity: "Pozitiflik", scHumor: "Mizah",
    scToxicity: "Toksiklik", scSad: "Hüzün", scAccount: "Hesap verebilirlik", scCuriosity: "Merak",
    convRatings: "Konuşma puanları", convRatingsHint: "Her sohbet, uzunluğu ve iki tarafın da katılımına göre 1–5 yıldız — uzun ve karşılıklı sohbetler daha yüksek.",
    balance: "Denge", convAnalysis: "Konuşma analizi",
    msgTimes: "Mesajlaşma zamanları", content: "İçerik analizi", topWords: "Öne çıkan kelimeler",
    champions: "Şampiyonlar", milestones: "Kilometre taşları", msgAnalysis: "Mesaj analizi",
    responding: "Yanıt verme", respondingUnit: "dk:sn", mediaH: "Medya",
    started: "Başlatılan", ended: "Bitirilen", topContrib: "En çok katkı", quality: "Kalite seviyesi (4★+)",
    reachOut: "Yeniden yazan (reach out)", doubles: "Peş peşe mesaj", ignored: "Yanıtsız kalan soru",
    emoji: "Emoji", laughs: "Gülme", laughR: "Gülme · random", laughE: "Gülme · emoji", apologies: "Özür",
    questions: "Soru", encouragement: "Teşvik", url: "URL", message: "Mesaj", words: "Kelime",
    unique: "Benzersiz kelime", chars: "Karakter", immediate: "Anında yanıt", firstResp: "İlk yanıt süresi",
    replyMedian: "Yanıt süresi (medyan)", startsDay: "Günü başlatan (ilk mesaj)", endsDay: "Günü bitiren (son mesaj)", nightOwl: "Gece kuşu 🦉",
    firstMsg: "İlk mesaj", nthMsg: (n) => `${n}. mesaj`, busiestDay: "En yoğun gün", longestSilence: "En uzun sessizlik",
    activeStreak: "En uzun konuşma serisi",
    balanceMost: (name) => `Katkının çoğu <b>${name}</b>'ten geliyor.`,
    peakSentence: (day, block) => `En yoğun: <b>${day}</b> günü <b>${block}</b>.`,
    pWords: "kelime", pUnique: "benzersiz kelime", pAvgWords: "ort. kelime/mesaj", pChars: "karakter",
    pTopWords: "En çok kullandığı kelimeler", pContent: "İçerik", pEmojiTotal: "Emoji (toplam)",
    pTiming: "Zamanlama", pActiveHour: "En aktif saat", pReplyMean: "Yanıt (ortalama)", pReplyMed: "Yanıt (medyan)",
    pChamp: "Şampiyonluk", pStartsDay: "Günü başlatma", pEndsDay: "Günü bitirme", daysWord: "gün",
    love: "Sevgi", spice: "Ateşli", swear: "Küfür",
    quarterly: "Çeyrek açılışları", quarterlyHint: "her çeyreğin ilk mesajı",
    onThisDay: "Geçmişte bugün", onThisDaySub: (n) => `${n} mesaj`,
    anniversary: (n) => `${n}. yıl`, loveBomb: "En tutkulu gün",
    streak: "En uzun tek taraflı seri", silenceBroke: "Sessizliği bozan", silenceWord: "sessizlik", streakUnit: "mesaj",
    spicyH: "Aşk & tutku", swearH: "Küfür ölçer",
    heatChamp: (name) => `En tutkulusu: <b>${name}</b> 💓`,
    swearChamp: (name) => `En bozuk ağızlı: <b>${name}</b>`,
    swearRate: (pct) => `mesajların %${pct}'i küfürlü`,
    loveBombLine: (date, n) => `En tutkulu gün: <b>${date}</b> · ${n} sevgi işareti`,
  },
  en: {
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    blocks: ["Early morning", "Morning", "Afternoon", "Evening", "Night"],
    media: { image: "Images", video: "Videos", audio: "Voice", gif: "GIFs", sticker: "Stickers", document: "Documents", contact: "Contacts" },
    ratings: ["A quiet relationship", "An okay relationship", "A good relationship", "A very good relationship", "An excellent relationship"],
    points: "Chat points", duration: "Duration", messages: "Messages", conversations: "Conversations", activeDays: "active days",
    pointsSuffix: "chat points", msgWord: "messages", pointWord: "points", convWord: "conversations",
    people: "People", peopleHint: "tap for details",
    activity: "Activity over time", rating: "Chat rating", insights: "Key insights",
    phrases: "Common phrases",
    mood: "Mood over time", moodHint: "warmth – tension", moodWarm: "Warmest", moodTense: "Tensest",
    compat: "Compatibility", rpBalance: "Balance", rpRecip: "Reciprocity", rpConsistency: "Consistency", rpEngagement: "Engagement",
    longestConvo: "Longest conversation", convoMsgs: "messages", seeFull: "See full", seeContext: "See context",
    randomMemory: "Random memory", memShuffle: "🎲 Another", memRemember: "remember this?",
    ghosting: "Left on read", ghostMost: (name) => `Ghosts most: <b>${name}</b>`, ghostLeft: "Questions left hanging",
    replyTrend: "Reply-time trend", replyTrendHint: "median · min:sec", replyFast: "Fastest", replySlow: "Slowest",
    awards: "Awards", awNight: "Night owl", awLaugh: "Laugh champion", awQuestion: "Question monster",
    awApology: "Apology master", awMedia: "Media king", awLast: "Last word", awFirst: "Early bird",
    awDouble: "Double-texter", awLove: "Romantic", awSwear: "Potty mouth", awEssay: "Novelist", awFast: "Lightning reply",
    wrapped: "Wrapped card", wrappedRating: "match", wrappedBusiest: "busiest day", wrappedStreak: "longest streak", wrappedTopEmoji: "top emoji",
    reportCard: "Chat report card", reportCardHint: "50 = a typical chat · above/below by dynamics",
    scAffection: "Affection", scFlirt: "Flirt", scPositivity: "Positivity", scHumor: "Humor",
    scToxicity: "Toxicity", scSad: "Low mood", scAccount: "Accountability", scCuriosity: "Curiosity",
    convRatings: "Conversation ratings", convRatingsHint: "Each conversation scores 1–5 stars by length and how much both people take part — long, two-sided chats rate higher.",
    balance: "Balance", convAnalysis: "Conversation analysis",
    msgTimes: "Messaging times", content: "Content analysis", topWords: "Top words",
    champions: "Champions", milestones: "Milestones", msgAnalysis: "Message analysis",
    responding: "Responding", respondingUnit: "min:sec", mediaH: "Media",
    started: "Started", ended: "Ended", topContrib: "Top contributor", quality: "Quality level (4★+)",
    reachOut: "Reach outs", doubles: "Double messages", ignored: "Left on read",
    emoji: "Emoji", laughs: "Laughs", laughR: "Laughs · random", laughE: "Laughs · emoji", apologies: "Apologies",
    questions: "Questions", encouragement: "Encouragement", url: "URLs", message: "Messages", words: "Words",
    unique: "Unique words", chars: "Characters", immediate: "Immediate replies", firstResp: "First response time",
    replyMedian: "Response time (median)", startsDay: "Starts the day (first message)", endsDay: "Ends the day (last message)", nightOwl: "Night owl 🦉",
    firstMsg: "First message", nthMsg: (n) => `${n}th message`, busiestDay: "Busiest day", longestSilence: "Longest silence",
    activeStreak: "Longest daily streak",
    balanceMost: (name) => `Most of the contribution comes from <b>${name}</b>.`,
    peakSentence: (day, block) => `Peak: <b>${block}</b> on <b>${day}</b>.`,
    pWords: "words", pUnique: "unique words", pAvgWords: "avg words/msg", pChars: "characters",
    pTopWords: "Most used words", pContent: "Content", pEmojiTotal: "Emoji (total)",
    pTiming: "Timing", pActiveHour: "Most active hour", pReplyMean: "Response (mean)", pReplyMed: "Response (median)",
    pChamp: "Championship", pStartsDay: "Days started", pEndsDay: "Days ended", daysWord: "days",
    love: "Love", spice: "Spicy", swear: "Swearing",
    quarterly: "Quarterly openers", quarterlyHint: "first message of each quarter",
    onThisDay: "On this day", onThisDaySub: (n) => `${n} messages`,
    anniversary: (n) => `Year ${n}`, loveBomb: "Most passionate day",
    streak: "Longest one-sided streak", silenceBroke: "Broke the silence", silenceWord: "of silence", streakUnit: "messages",
    spicyH: "Love & passion", swearH: "Swear-o-meter",
    heatChamp: (name) => `Most passionate: <b>${name}</b> 💓`,
    swearChamp: (name) => `Foulest mouth: <b>${name}</b>`,
    swearRate: (pct) => `${pct}% of messages swear`,
    loveBombLine: (date, n) => `Most passionate day: <b>${date}</b> · ${n} love signals`,
  },
};

// A playful one-line relationship title derived from the stats (first matching rule wins).
export function relTitle(stats) {
  const { core, scoring: sc, content, champions } = stats;
  const senders = core.senders;
  const many = senders.length > 2;
  const text = Math.max(1, core.total - core.media_total);
  const sum = (k) => senders.reduce((t, s) => t + (content[s][k] || 0), 0);
  const rate = (k) => 100 * sum(k) / text;
  const humor = 100 * senders.reduce((t, s) => t + content[s].laughs_emojis + content[s].laughs_randoms, 0) / text;
  const nightAvg = senders.reduce((t, s) => t + (champions.night_owl?.[s] || 0), 0) / senders.length;
  const apoRate = rate("apologies"), balanced = Math.abs((sc.balance[senders[0]] ?? 50) - (sc.balance[senders[1]] ?? 50)) < 6;
  const consistency = core.active_days / core.span_days;
  // thresholds tuned for the severity-weighted love/spice/swear sums.
  if (rate("swear") >= 10 && sc.chat_rating >= 60) return { tr: "Kaotik ama sıkı 😈", en: "Chaotic but tight 😈" };
  if (rate("love") >= 2 && rate("spice") >= 1.5) return { tr: "Ateşli âşıklar 🔥", en: "Passionate lovers 🔥" };
  if (rate("love") + rate("spice") >= 2.5) return { tr: "Sevgi dolu 💕", en: "A loving pair 💕" };
  if (nightAvg >= 15) return { tr: "Gece filozofları 🌙", en: "Night philosophers 🌙" };
  if (rate("swear") >= 12) return { tr: "Ağzı bozuk çete 🤬", en: "Foul-mouthed crew 🤬" };
  if (humor >= 8) return { tr: "Kahkaha makinesi 😂", en: "Laugh factory 😂" };
  if (apoRate >= 1) return { tr: "Barışçıl ruhlar 🕊️", en: "Peacemakers 🕊️" };
  if (rate("questions") >= 15) return { tr: "Meraklı ikili ❓", en: "The curious ones ❓" };
  if (sc.chat_rating >= 80) return { tr: "Kusursuz uyum ✨", en: "Perfect match ✨" };
  if (balanced && sc.chat_rating >= 55) return { tr: "Dengeli ikili ⚖️", en: "Perfectly balanced ⚖️" };
  if (consistency >= 0.85) return { tr: "Her gün buradayız 📅", en: "Here every single day 📅" };
  if (core.msgs_per_day >= 60) return { tr: "Durmak bilmeyenler 💬", en: "Never stop talking 💬" };
  if (core.msgs_per_day <= 3) return { tr: "Az ama öz 🤏", en: "Rare but real 🤏" };
  if (core.span_days >= 1460) return { tr: "Eski dostlar 🕰️", en: "Old friends 🕰️" };
  if (many) return { tr: "Kalabalık çete 🎉", en: "The whole crew 🎉" };
  return { tr: "İyi bir ikili 🙂", en: "A good pair 🙂" };
}

function ratingRing(score) {
  const r = 40, c = 2 * Math.PI * r, off = c * (1 - score / 100);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <circle cx="48" cy="48" r="${r}" fill="none" stroke="#263444" stroke-width="8"/>
    <circle cx="48" cy="48" r="${r}" fill="none" stroke="#2ecc71" stroke-width="8"
      stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
      transform="rotate(-90 48 48)"/>
    <text x="48" y="55" text-anchor="middle" font-size="26" font-weight="800" fill="#e8eef4">${score}</text>
  </svg>`;
}

// Superlative awards: for each of 12 signals, the leading sender (argmax over senders).
// Shared by the report's awards wall and Wrapped's awards ceremony so they never drift.
// Returns [{icon, label, winner}] for signals with a non-zero max; label is localized.
export function computeAwards(stats, lang = "tr") {
  const L = LABELS[lang] ?? LABELS.tr;
  const { core, dynamics: dyn, content, champions } = stats;
  const senders = core.senders;
  const AW = [
    ["🦉", L.awNight, (s) => champions.night_owl?.[s] ?? 0], ["😂", L.awLaugh, (s) => content[s].laughs_emojis + content[s].laughs_randoms],
    ["❓", L.awQuestion, (s) => content[s].questions], ["🙏", L.awApology, (s) => content[s].apologies],
    ["📸", L.awMedia, (s) => core.per_sender[s].media_total], ["🌙", L.awLast, (s) => champions.last_texter[s]],
    ["☀️", L.awFirst, (s) => champions.first_texter[s]], ["🔁", L.awDouble, (s) => content[s].doubles],
    ["❤️", L.awLove, (s) => content[s].love], ["🤬", L.awSwear, (s) => content[s].swear],
    ["📝", L.awEssay, (s) => core.per_sender[s].avg_words], ["⚡", L.awFast, (s) => dyn.immediate_pct[s] ?? 0],
  ];
  return AW.map(([icon, label, f]) => {
    let win = senders[0], max = f(senders[0]);
    for (const s of senders) { const v = f(s); if (v > max) { max = v; win = s; } }
    return max > 0 ? { icon, label, winner: win } : null;
  }).filter(Boolean);
}

// Render the report body (inner HTML of .report), in the given language (tr default).
export function reportHTML(stats, lang = "tr") {
  const L = LABELS[lang] ?? LABELS.tr;
  const { core, time, dynamics: dyn, content, scoring: sc, conversations: conv, fun, champions, milestones } = stats;
  const senders = core.senders;
  const many = senders.length > 2;
  const color = Object.fromEntries(senders.map((s, i) => [s, PALETTE[i % PALETTE.length]]));
  const out = [];

  const metric = (label, vals, icon = "", fmt = nf) => {
    if (!many) {
      const [A, B] = senders;
      return `<div class="crow"><span class="lbl">${icon ? `<span>${icon}</span>` : ""}${esc(label)}</span>` +
        `<span class="v" style="color:${color[A]}">${fmt(vals[A])}</span>` +
        `<span class="v" style="color:${color[B]}">${fmt(vals[B])}</span></div>`;
    }
    const max = Math.max(1, ...senders.map((s) => num(vals[s])));
    const bars = senders
      .slice().sort((a, b) => num(vals[b]) - num(vals[a]))
      .map((s) => `<div class="mbar"><span class="mname" style="color:${color[s]}">${esc(s)}</span>` +
        `<span class="mtrack"><i style="width:${(100 * num(vals[s]) / max).toFixed(1)}%;background:${color[s]}"></i></span>` +
        `<b>${fmt(vals[s])}</b></div>`).join("");
    return `<div class="mblock"><div class="mlabel">${icon ? `${icon} ` : ""}${esc(label)}</div>${bars}</div>`;
  };
  const legend = many ? "" :
    `<div class="leg"><span style="color:${color[senders[0]]}">${esc(senders[0])}</span>` +
    `<span style="color:${color[senders[1]]}">${esc(senders[1])}</span></div>`;

  // A message's display body: a media message shows a small type label (no zip media here, so we
  // "just say image") plus any caption; a text message shows its text. ponytail: when a future
  // export ships the actual media file, this is where an <img> thumbnail would slot in.
  const msgBody = (mm) => {
    if (mm.media) {
      const tag = `<span class="qmedia">${MEDIA_IC[mm.media] ?? "📎"} ${esc(L.media[mm.media] ?? mm.media)}</span>`;
      return mm.text ? `${tag} ${esc(mm.text)}` : tag;
    }
    return esc(mm.text) || "—";
  };
  const bubble = (mm) =>
    `<div class="qmsg"><span class="qwho" style="color:${color[mm.sender] ?? PALETTE[0]}">${esc(mm.sender)}</span> ${msgBody(mm)}</div>`;

  // ── header ──
  const shown = senders.slice(0, 5);
  const avatars = shown.map((s) => `<div class="av" data-person="${esc(s)}" style="background:${color[s]}">${esc(initial(s))}</div>`).join("") +
    (senders.length > 5 ? `<div class="av more">+${senders.length - 5}</div>` : "");
  const who = many ? senders.map(esc).join(", ") : `${esc(senders[0])} &amp; ${esc(senders[1])}`;
  const title = relTitle(stats);
  out.push(`<section class="head">
    <div class="avatars">${avatars}</div>
    <div class="who">${who}</div>
    <div class="reltitle">${esc(title[lang] ?? title.tr)}</div>
    <div class="range">${fmtDate(core.first, lang)} – ${fmtDate(core.last, lang)} · ${core.active_days}/${core.span_days} ${esc(L.activeDays)}</div>
  </section>`);

  // ── people (tap for deep-dive) ──
  out.push(`<section><h2><span class="ic">👥</span>${esc(L.people)} <small>(${esc(L.peopleHint)})</small></h2>
    <div class="people">${senders.map((s) =>
      `<button class="ptap" data-person="${esc(s)}"><span class="av" style="background:${color[s]};width:30px;height:30px;font-size:13px;border:none">${esc(initial(s))}</span>` +
      `<span class="pn">${esc(s)}</span><span class="pc">${nf(core.per_sender[s].messages)}</span></button>`).join("")}</div></section>`);

  // ── activity over time ──
  const months = time.by_month;
  if (months.length) {
    const max = Math.max(...months.map(([, n]) => n));
    const monthLabel = (key) => { const [y, mo] = key.split("-").map(Number); return `${MONTHS[lang][mo - 1]} ${y}`; };
    const bars = months.map(([key, n]) => {
      const lbl = monthLabel(key);
      return `<i style="height:${(100 * n / max).toFixed(1)}%" title="${esc(lbl)} · ${nf(n)}" data-m="${esc(lbl)}" data-n="${nf(n)}"></i>`;
    }).join("");
    const range = `${esc(monthLabel(months[0][0]))} → ${esc(monthLabel(months.at(-1)[0]))}`;
    out.push(`<section><h2><span class="ic">📈</span>${esc(L.activity)}</h2>
      <div class="spark">${bars}</div>
      <div class="sparkread" data-def="${range}">${range}</div></section>`);
  } else out.push("");

  // ── chat rating + compatibility breakdown ──
  const rp = sc.rating_parts ?? {};
  const compatRows = [["rpBalance", "balance"], ["rpRecip", "reciprocity"], ["rpConsistency", "consistency"], ["rpEngagement", "engagement"]]
    .map(([lab, key]) => `<div class="cpr"><span class="cplbl">${esc(L[lab])}</span>` +
      `<span class="cptrack"><i style="width:${Math.max(0, Math.min(100, rp[key] ?? 0))}%"></i></span>` +
      `<b>${nf(rp[key] ?? 0)}</b></div>`).join("");
  out.push(`<section><h2><span class="ic">🏆</span>${esc(L.rating)}</h2>
    <div class="ring">${ratingRing(sc.chat_rating)}
      <div><div class="label">${esc(L.ratings[ratingBucket(sc.chat_rating)])}</div>
        <div class="k">${nf(sc.chat_points_total)} ${esc(L.pointsSuffix)}</div></div></div>
    <div class="compat"><div class="mlabel">${esc(L.compat)}</div>${compatRows}</div></section>`);

  // ── key insights ──
  if (stats.insights.length) {
    const tips = stats.insights.map((t) => `<div class="tip"><span class="ic">💡</span><span>${esc(t[lang] ?? t.tr ?? t)}</span></div>`).join("");
    out.push(`<section><h2><span class="ic">🔑</span>${esc(L.insights)}</h2>${tips}</section>`);
  } else out.push("");

  // ── conversation ratings (5★) ──
  const smax = Math.max(...Object.values(sc.stars), 1);
  const starRows = [5, 4, 3, 2, 1].map((n) =>
    `<div class="star"><span class="s">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>` +
    `<span class="track"><i style="width:${(100 * sc.stars[n] / smax).toFixed(1)}%"></i></span>` +
    `<b>${nf(sc.stars[n])}</b></div>`).join("");
  out.push(`<section><h2><span class="ic">⭐</span>${esc(L.convRatings)} <small>(${nf(conv.total)} ${esc(L.convWord)})</small></h2>` +
    `<div class="peak" style="margin:-2px 0 8px">${esc(L.convRatingsHint)}</div>${starRows}</section>`);

  const cv = (key) => Object.fromEntries(senders.map((s) => [s, content[s][key]]));
  const psv = (key) => Object.fromEntries(senders.map((s) => [s, core.per_sender[s][key]]));
  const topContrib = senders.reduce((a, b) => (sc.chat_points[b] > sc.chat_points[a] ? b : a));

  // ── balance ──
  if (!many) {
    const [A, B] = senders;
    const ba = sc.balance[A] ?? 50, bb = sc.balance[B] ?? 50;
    out.push(`<section><h2><span class="ic">⚖️</span>${esc(L.balance)}</h2>
      <div class="balbar"><i style="width:${ba}%;background:${color[A]}">${ba}%</i>` +
      `<i style="width:${bb}%;background:${color[B]};color:#1a0606;justify-content:flex-end">${bb}%</i></div>
      <div class="balpts"><span style="color:${color[A]}">${esc(A)} · ${nf(sc.chat_points[A])} p</span>
        <span style="color:${color[B]}">${nf(sc.chat_points[B])} p · ${esc(B)}</span></div>
      <div class="peak" style="margin-top:8px">${L.balanceMost(esc(topContrib))}</div></section>`);
  } else {
    const segs = senders.map((s) => {
      const p = sc.balance[s] ?? 0;
      return `<i style="width:${p}%;background:${color[s]}">${p >= 9 ? p + "%" : ""}</i>`;
    }).join("");
    const chips = senders.slice().sort((a, b) => (sc.balance[b] ?? 0) - (sc.balance[a] ?? 0))
      .map((s) => `<span class="chip"><span style="color:${color[s]}">●</span> ${esc(s)} <b>${sc.balance[s] ?? 0}%</b></span>`).join("");
    out.push(`<section><h2><span class="ic">⚖️</span>${esc(L.balance)}</h2>
      <div class="balbar">${segs}</div>
      <div class="chips" style="margin:8px 0">${chips}</div>
      <div class="peak">${L.balanceMost(esc(topContrib))}</div></section>`);
  }

  // ── conversation analysis ──
  out.push(`<section><h2><span class="ic">🗨️</span>${esc(L.convAnalysis)}</h2>${legend}
    ${metric(L.started, dyn.starters, "👋")}
    ${metric(L.ended, conv.ended, "🔚")}
    ${metric(L.topContrib, sc.top_contributor, "🥇")}
    ${metric(L.quality, sc.quality_level, "💎")}
    ${metric(L.reachOut, conv.reach_outs, "📣")}
    ${metric(L.doubles, cv("doubles"), "🔁")}
    ${metric(L.ignored, cv("ignored"), "🙈")}</section>`);

  // ── messaging times (heatmap) ──
  const hm = time.heatmap, cellmax = Math.max(1, ...hm.grid.flat());
  let heat = `<tr><th></th>${L.days.map((d) => `<th>${esc(d.slice(0, 2))}</th>`).join("")}</tr>`;
  hm.grid.forEach((row, b) => {
    const cells = row.map((v) => `<td title="${nf(v)}" style="background:rgba(83,177,253,${(0.08 + 0.92 * v / cellmax).toFixed(2)})">${kfmt(v)}</td>`).join("");
    heat += `<tr><th class="rl">${esc(L.blocks[b])}</th>${cells}</tr>`;
  });
  let peak = [0, 0];
  hm.grid.forEach((row, b) => row.forEach((v, d) => { if (v > hm.grid[peak[0]][peak[1]]) peak = [b, d]; }));
  out.push(`<section><h2><span class="ic">🕑</span>${esc(L.msgTimes)}</h2>
    <table class="heat">${heat}</table>
    <div class="peak">${L.peakSentence(esc(L.days[peak[1]]), esc(L.blocks[peak[0]].toLowerCase()))}</div></section>`);

  // ── content analysis ──
  const emojiRow = (s) => {
    const es = content[s].top_emoji.slice(0, 6)
      .map(([e, n]) => `<span class="e">${e}<small>${nf(n)}</small></span>`).join("");
    return `<div class="emojirow"><span class="who" style="color:${color[s]}">${esc(s)}</span><span class="es">${es || "<small>—</small>"}</span></div>`;
  };
  const laughsAll = Object.fromEntries(senders.map((s) => [s, content[s].laughs_randoms + content[s].laughs_emojis]));
  out.push(`<section><h2><span class="ic">✍️</span>${esc(L.content)}</h2>
    ${senders.map(emojiRow).join("")}
    <div style="height:8px"></div>${legend}
    ${metric(L.emoji, cv("emoji_total"), "😊")}
    ${metric(L.laughs, laughsAll, "😂")}
    ${metric(L.love, cv("love"), "❤️")}
    ${metric(L.spice, cv("spice"), "🌶️")}
    ${metric(L.swear, cv("swear"), "🤬")}
    ${metric(L.apologies, cv("apologies"), "🙏")}
    ${metric(L.questions, cv("questions"), "❓")}
    ${metric(L.encouragement, cv("encouragement"), "💪")}</section>`);

  // ── top words (word cloud) ──
  const cloud = (s) => {
    const ws = fun.top_words[s];
    if (!ws.length) return "";
    const max = ws[0][1], min = ws.at(-1)[1];
    const tags = ws.map(([w, n]) => {
      const size = 13 + 16 * (max === min ? 1 : (n - min) / (max - min));
      return `<span class="cw" style="font-size:${size.toFixed(0)}px;color:${color[s]}">${esc(w)}</span>`;
    }).join(" ");
    return `<div class="cloud"><div class="cloudwho" style="color:${color[s]}">${esc(s)}</div><div class="cwrap">${tags}</div></div>`;
  };
  if (senders.some((s) => fun.top_words[s].length))
    out.push(`<section><h2><span class="ic">🔤</span>${esc(L.topWords)}</h2>${senders.map(cloud).join("")}</section>`);
  else out.push("");

  // ── message analysis ──
  out.push(`<section><h2><span class="ic">💬</span>${esc(L.msgAnalysis)}</h2>${legend}
    ${metric(L.message, psv("messages"), "💬")}
    ${metric(L.words, psv("words"), "📝")}
    ${metric(L.unique, cv("unique_words"), "🔤")}
    ${metric(L.chars, psv("chars"), "🔡")}</section>`);

  // ── responding ──
  const fpct = (v) => (v == null ? "—" : `${v}%`);
  out.push(`<section><h2><span class="ic">⚡</span>${esc(L.responding)} <small>(${esc(L.respondingUnit)})</small></h2>${legend}
    ${metric(L.immediate, dyn.immediate_pct, "⚡", fpct)}
    ${metric(L.firstResp, dyn.first_response_secs, "🚀", hms)}
    ${metric(L.replyMedian, dyn.reply_median_secs, "⏱️", hms)}</section>`);

  // ── champions ── (peak hour coincides between people, so show the night-owl % which differs)
  out.push(`<section><h2><span class="ic">🥇</span>${esc(L.champions)}</h2>${legend}
    ${metric(L.startsDay, champions.first_texter, "☀️")}
    ${metric(L.endsDay, champions.last_texter, "🌙")}
    ${metric(L.nightOwl, champions.night_owl ?? {}, "🦉", (v) => `${v ?? 0}%`)}</section>`);

  // ── milestones ──
  const ms = [["🎉", L.firstMsg, fmtDate(core.first, lang)]];
  for (const [n, d] of Object.entries(milestones.nth))
    if (+n > 1) ms.push(["📈", L.nthMsg(nf(+n)), fmtDate(new Date(d), lang)]);
  ms.push(["🔥", L.busiestDay, `${fmtDate(dayFromKey(time.busiest_day[0]), lang)} · ${nf(time.busiest_day[1])} ${L.msgWord}`]);
  if (time.active_streak?.days > 1) {
    const as = time.active_streak;
    ms.push(["📆", L.activeStreak, `${nf(as.days)} ${L.daysWord} · ${fmtDate(new Date(as.from), lang)} → ${fmtDate(new Date(as.to), lang)}`]);
  }
  if (fun.love_bomb)
    ms.push(["💘", L.loveBomb, `${fmtDate(dayFromKey(fun.love_bomb.day), lang)} · ${nf(fun.love_bomb.count)}`,
      fun.love_bomb.msgs?.length ? fun.love_bomb.msgs.map(bubble).join("") : null]);
  // Longest one-sided streak across senders — expandable to the run's messages.
  const streakWho = senders.reduce((a, b) => (content[b].longest_streak > content[a].longest_streak ? b : a));
  if (content[streakWho].longest_streak > 1) {
    const sm = content[streakWho].streak_msgs ?? [];
    ms.push(["📌", L.streak, `${streakWho} · ${nf(content[streakWho].longest_streak)} ${L.streakUnit}`,
      sm.length ? sm.map(bubble).join("") : null]);
  }
  if (time.longest_gap) {
    const g = time.longest_gap;
    const broke = g.by ? ` · ${L.silenceBroke}: ${g.by}` : "";
    // Expandable: the last message before the silence, a marked silence gap (with duration), then
    // the comeback that broke it.
    const expand = g.before
      ? bubble(g.before) +
        `<div class="silencemark"><span>😴 ${esc(humanDur(g.secs, lang))} ${esc(L.silenceWord)}</span></div>` +
        (g.comeback ?? []).map(bubble).join("")
      : null;
    ms.push(["🤫", L.longestSilence, `${humanDur(g.secs, lang)} · ${fmtDate(new Date(g.from), lang)} → ${fmtDate(new Date(g.to), lang)}${broke}`, expand]);
  }
  const msRows = ms.map(([ic, label, val, expand]) =>
    expand
      ? `<details class="msrow msx"><summary><span class="msic">${ic}</span><span class="mslbl">${esc(label)}</span><span class="msval">${esc(val)}</span></summary>` +
        `<div class="qexpand">${expand}</div></details>`
      : `<div class="msrow"><span class="msic">${ic}</span><span class="mslbl">${esc(label)}</span><span class="msval">${esc(val)}</span></div>`).join("");
  out.push(`<section><h2><span class="ic">🏁</span>${esc(L.milestones)}</h2>${msRows}</section>`);

  // ── media (per sender, per type) ──
  if (Object.keys(core.media).length) {
    const types = Object.entries(core.media).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const rows = types.map((t) =>
      metric(L.media[t] ?? t, Object.fromEntries(senders.map((s) => [s, core.per_sender[s].media[t] ?? 0])), MEDIA_IC[t] ?? "📎")
    ).join("");
    out.push(`<section><h2><span class="ic">📎</span>${esc(L.mediaH)}</h2>${legend}${rows}</section>`);
  } else out.push("");

  out.push(`<div class="foot">${who} · ${nf(core.total)} ${esc(L.msgWord)} · whatsapp-stats</div>`);

  // ── quarterly openers (index 17) — the opening exchange of each quarter, expandable ──
  if (fun.quarter_openers?.length > 1) {
    const rows = fun.quarter_openers.map((o) => {
      const first = o.msgs[0] ?? { sender: o.sender, text: "" };
      return `<details class="qopen"><summary><span class="qq">${esc(o.q)}</span>` +
        `<span class="qwho" style="color:${color[first.sender] ?? PALETTE[0]}">${esc(first.sender)}</span>` +
        `<span class="qtext">${msgBody(first)}</span></summary>` +
        `<div class="qexpand">${o.msgs.map(bubble).join("")}</div></details>`;
    }).join("");
    out.push(`<section><h2><span class="ic">🗓️</span>${esc(L.quarterly)} <small>(${esc(L.quarterlyHint)})</small></h2>${rows}</section>`);
  } else out.push("");

  // ── on this day (index 18) — messages from today's month+day in earlier years, expandable (JS-only) ──
  if (fun.on_this_day) {
    const rows = fun.on_this_day.years.map((yr) => {
      const first = yr.msgs[0] ?? { sender: "", text: "" };
      return `<details class="qopen"><summary><span class="qq">${yr.year}</span>` +
        `<span class="otdn">${esc(L.onThisDaySub(nf(yr.count)))}</span>` +
        `<span class="qtext">${msgBody(first)}</span></summary>` +
        `<div class="qexpand">${yr.msgs.map(bubble).join("")}</div></details>`;
    }).join("");
    out.push(`<section><h2><span class="ic">📅</span>${esc(L.onThisDay)}</h2>${rows}</section>`);
  } else out.push("");

  // ── common phrases (index 19) — top per-sender bigrams as quoted chips ──
  const phraseBlock = (s) => {
    const ps = fun.top_phrases?.[s] ?? [];
    if (!ps.length) return "";
    const chips = ps.map(([p, n]) => `<span class="chip"><span style="color:${color[s]}">“${esc(p)}”</span> <b>${nf(n)}</b></span>`).join("");
    return `<div class="cloudwho" style="color:${color[s]}">${esc(s)}</div><div class="chips" style="margin:4px 0 10px">${chips}</div>`;
  };
  if (senders.some((s) => (fun.top_phrases?.[s] ?? []).length))
    out.push(`<section><h2><span class="ic">💬</span>${esc(L.phrases)}</h2>${senders.map(phraseBlock).join("")}</section>`);
  else out.push("");

  // ── report card (index 20) — relationship-dynamics scores centered on 50 = a typical chat ──
  // Each dimension's rate (per text message) is scored against a TYPICAL rate that maps to 50, so
  // the bar shows how far above/below average this chat is on that trait: score = 50·rate/typical,
  // clamped 0–100. The bar grows from the centre (50) — right (in the dimension's colour) when above
  // average, left (muted) when below. Typicals are tunable estimates of an average chat.
  const textMsgs = Math.max(1, core.total - core.media_total);
  const sumCat = (key) => senders.reduce((t, s) => t + (content[s][key] || 0), 0);
  const humor = senders.reduce((t, s) => t + content[s].laughs_emojis + content[s].laughs_randoms, 0);
  // [icon, label, count, typicalRate% (=score 50), color]
  const dims = [
    ["❤️", L.scAffection, sumCat("love"), 0.9, "#ff5d8f"],
    ["🔥", L.scFlirt, sumCat("spice"), 1.0, "#ff8a3d"],
    ["🤝", L.scPositivity, sumCat("encouragement") + sumCat("thanks") + sumCat("celebration"), 1.4, "#2ecc71"],
    ["😄", L.scHumor, humor, 3.5, "#f5c542"],
    ["😡", L.scToxicity, sumCat("swear"), 2.5, "#e0503a"],
    ["😔", L.scSad, sumCat("sad"), 0.15, "#7f9cb5"],
    ["🙏", L.scAccount, sumCat("apologies"), 0.08, "#2ec5c5"],
    ["❓", L.scCuriosity, sumCat("questions"), 11.0, "#b06fe6"],
  ];
  const scoreOf = (c, typ) => Math.max(0, Math.min(100, Math.round(50 * (100 * c / textMsgs) / typ)));
  const scRows = dims.map(([ic, label, c, typ, col]) => {
    const s0 = scoreOf(c, typ);
    const seg = s0 >= 50
      ? `left:50%;width:${s0 - 50}%;background:${col}`
      : `left:${s0}%;width:${50 - s0}%;background:#6b7684`;
    return `<div class="scrow"><span class="scic">${ic}</span><span class="sclbl">${esc(label)}</span>` +
      `<span class="sctrack mid"><i style="${seg}"></i></span>` +
      `<span class="scpct ${s0 >= 50 ? "up" : "down"}">${s0}</span><span class="sccount">${nf(c)}</span></div>`;
  }).join("");
  out.push(`<section><h2><span class="ic">📊</span>${esc(L.reportCard)} <small>(${esc(L.reportCardHint)})</small></h2>${scRows}</section>`);

  // ── mood over time (index 21) — monthly warmth vs tension as a diverging column chart ──
  const mood = time.mood ?? [];
  if (mood.length > 1) {
    const monthLabel = (key) => { const [y, mo] = key.split("-").map(Number); return `${MONTHS[lang][mo - 1]} ${y}`; };
    // Net mood = warmth − tension messages that month (volume-aware, so a 2-message month can't spike).
    const nets = mood.map(([, p, ng]) => p - ng);
    const maxAbs = Math.max(1, ...nets.map(Math.abs));
    const bars = mood.map(([key, p, ng], i) => {
      const net = nets[i], up = net >= 0, h = 50 * Math.abs(net) / maxAbs;
      return `<span class="mud"><i class="${up ? "pos" : "neg"}" style="height:${h.toFixed(1)}%" title="${esc(monthLabel(key))} · +${nf(p)}/−${nf(ng)}"></i></span>`;
    }).join("");
    let wi = 0, ti = 0;
    nets.forEach((r, i) => { if (r > nets[wi]) wi = i; if (r < nets[ti]) ti = i; });
    const cap = `${esc(L.moodWarm)}: <b>${esc(monthLabel(mood[wi][0]))}</b> · ${esc(L.moodTense)}: <b>${esc(monthLabel(mood[ti][0]))}</b>`;
    out.push(`<section><h2><span class="ic">🌤️</span>${esc(L.mood)} <small>(${esc(L.moodHint)})</small></h2>
      <div class="moodbars">${bars}</div><div class="peak">${cap}</div></section>`);
  } else out.push("");

  // ── longest conversation (index 22) — the marathon session, expandable replay ──
  const lc = fun.longest_convo;
  if (lc && lc.count > 3 && lc.msgs.length) {
    const seeFull = lc.count > lc.msgs.length
      ? `<button class="seefull" type="button" data-from="${+new Date(lc.from)}" data-to="${+new Date(lc.to)}">${esc(L.seeFull)} (${nf(lc.count)})</button>` : "";
    out.push(`<section><h2><span class="ic">💬</span>${esc(L.longestConvo)} <small>(${nf(lc.count)} ${esc(L.convoMsgs)} · ${fmtDate(new Date(lc.from), lang)})</small></h2>` +
      `<details class="qopen"><summary><span class="qtext">${msgBody(lc.msgs[0])}</span></summary>` +
      `<div class="qexpand">${lc.msgs.map(bubble).join("")}</div></details>${seeFull}</section>`);
  } else out.push("");

  // ── random memory (index 23) — one sampled old message; the client shuffles among fun.memories ──
  const mems = fun.memories ?? [];
  if (mems.length) {
    const m0 = mems[0];
    out.push(`<section><h2><span class="ic">🕰️</span>${esc(L.randomMemory)} <small>(${esc(L.memRemember)})</small></h2>
      <div class="memwrap" data-when="${+new Date(m0.when)}"><div class="memcard"><span class="qwho" style="color:${color[m0.sender] ?? PALETTE[0]}">${esc(m0.sender)}</span> ${esc(m0.text)}<div class="memdate">${fmtDate(new Date(m0.when), lang)}</div></div>
      <div class="membtns"><button class="memshuffle" type="button">${esc(L.memShuffle)}</button><button class="memcontext" type="button">${esc(L.seeContext)}</button></div></div></section>`);
  } else out.push("");

  // ── left on read / ghosting (index 24) — whose questions die unanswered + who ghosts most ──
  if (senders.some((s) => content[s].ignored > 0)) {
    let cap = "";
    if (!many) { const [A, B] = senders; cap = `<div class="peak">${L.ghostMost(esc(content[B].ignored >= content[A].ignored ? A : B))}</div>`; }
    out.push(`<section><h2><span class="ic">👻</span>${esc(L.ghosting)}</h2>${legend}${metric(L.ghostLeft, cv("ignored"), "🙈")}${cap}</section>`);
  } else out.push("");

  // ── reply-time trend (index 25) — median reply seconds per month (taller = slower) ──
  const rt = time.reply_trend ?? [];
  if (rt.length > 1) {
    const monthLabel = (key) => { const [y, mo] = key.split("-").map(Number); return `${MONTHS[lang][mo - 1]} ${y}`; };
    const maxMed = Math.max(1, ...rt.map(([, m]) => m));
    const bars = rt.map(([key, med]) => `<i style="height:${Math.max(6, 100 * med / maxMed).toFixed(1)}%" title="${esc(monthLabel(key))} · ${hms(med)}"></i>`).join("");
    let fi = 0, si = 0;
    rt.forEach(([, m], i) => { if (m < rt[fi][1]) fi = i; if (m > rt[si][1]) si = i; });
    const cap = `${esc(L.replyFast)}: <b>${esc(monthLabel(rt[fi][0]))}</b> (${hms(rt[fi][1])}) · ${esc(L.replySlow)}: <b>${esc(monthLabel(rt[si][0]))}</b> (${hms(rt[si][1])})`;
    out.push(`<section><h2><span class="ic">⏱️</span>${esc(L.replyTrend)} <small>(${esc(L.replyTrendHint)})</small></h2><div class="tbars">${bars}</div><div class="peak">${cap}</div></section>`);
  } else out.push("");

  // ── awards wall (index 26) — a badge per superlative, handed to the leading sender ──
  const badges = computeAwards(stats, lang).map((a) =>
    `<div class="award"><span class="awic">${a.icon}</span><span class="awlbl">${esc(a.label)}</span><span class="awwin" style="color:${color[a.winner]}">${esc(a.winner)}</span></div>`).join("");
  out.push(badges ? `<section><h2><span class="ic">🏅</span>${esc(L.awards)}</h2><div class="awards">${badges}</div></section>` : "");

  // ── wrapped card (index 27) — a compact, shareable highlight card ──
  const topEmoji = fun.top_emoji[0]?.[0] ?? "—";
  const wrapRows = [
    ["💬", nf(core.total), L.msgWord], ["🗨️", nf(conv.total), L.convWord],
    ["⏳", humanSpan(core.first, core.last, lang), L.duration], ["🏆", `${sc.chat_rating}/100`, L.wrappedRating],
    ["😊", topEmoji, L.wrappedTopEmoji], ["🔥", fmtDate(dayFromKey(time.busiest_day[0]), lang), L.wrappedBusiest],
    ["📆", `${nf(time.active_streak?.days ?? 0)} ${L.daysWord}`, L.wrappedStreak], ["✅", nf(sc.chat_points_total), L.points],
  ].map(([ic, val, lab]) => `<div class="wrow"><span class="wic">${ic}</span><span class="wval">${esc(val)}</span><span class="wlab">${esc(lab)}</span></div>`).join("");
  out.push(`<section class="wrapcard"><div class="wraphdr">✨ ${esc(L.wrapped)}</div><div class="wraptitle">${esc(title[lang] ?? title.tr)}</div><div class="wrapwho">${who}</div><div class="wraprows">${wrapRows}</div></section>`);

  // Emit in a fixed reading order (engaging sections first), skipping empty slots. The pushes
  // above run in build order (0-27); this reindexes them so every report has the same structure.
  // Wrapped card (27) is the hero; common phrases (19) at the bottom; report card (20) after insights.
  const ORDER = [0, 27, 1, 18, 23, 3, 4, 20, 2, 21, 10, 26, 13, 14, 17, 22, 5, 6, 9, 8, 7, 24, 11, 12, 25, 15, 19, 16];
  return ORDER.map((i) => out[i]).filter(Boolean).join("\n");
}

// A focused deep-dive card for one person, in the given language.
export function personHTML(stats, sender, lang = "tr") {
  const L = LABELS[lang] ?? LABELS.tr;
  const { core, dynamics: dyn, content, scoring: sc, champions, fun } = stats;
  const i = core.senders.indexOf(sender);
  const c = PALETTE[i % PALETTE.length];
  const p = core.per_sender[sender];
  const ct = content[sender];
  const row = (ic, label, val) => `<div class="prow"><span>${ic} ${esc(label)}</span><b style="color:${c}">${val}</b></div>`;
  const stat = (n, k) => `<div class="stat"><div class="n">${n}</div><div class="k">${esc(k)}</div></div>`;
  const out = [];

  out.push(`<section>
    <div class="phead"><div class="av big" style="background:${c}">${esc(initial(sender))}</div>
      <div><div class="pname">${esc(sender)}</div>
        <div class="k">${nf(p.messages)} ${esc(L.msgWord)} · %${dyn.talk_share[sender]} · ${nf(sc.chat_points[sender])} ${esc(L.pointWord)}</div></div></div>
    <div class="statgrid" style="margin-top:14px">
      ${stat(nf(p.words), L.pWords)}${stat(nf(ct.unique_words), L.pUnique)}
      ${stat(p.avg_words, L.pAvgWords)}${stat(nf(p.chars), L.pChars)}</div></section>`);

  const ws = fun.top_words[sender];
  if (ws.length) {
    const max = ws[0][1], min = ws.at(-1)[1];
    const tags = ws.map(([w, n]) => {
      const size = 13 + 16 * (max === min ? 1 : (n - min) / (max - min));
      return `<span class="cw" style="font-size:${size.toFixed(0)}px;color:${c}">${esc(w)}</span>`;
    }).join(" ");
    out.push(`<section><h2><span class="ic">🔤</span>${esc(L.pTopWords)}</h2><div class="cwrap">${tags}</div></section>`);
  }

  const emoji = ct.top_emoji.slice(0, 8).map(([e, n]) => `<span class="e">${e}<small>${nf(n)}</small></span>`).join("");
  out.push(`<section><h2><span class="ic">✍️</span>${esc(L.pContent)}</h2>
    ${emoji ? `<div class="pemoji">${emoji}</div>` : ""}
    ${row("😆", L.laughR, nf(ct.laughs_randoms))}
    ${row("🤣", L.laughE, nf(ct.laughs_emojis))}
    ${row("😊", L.pEmojiTotal, nf(ct.emoji_total))}
    ${row("❓", L.questions, nf(ct.questions))}
    ${row("🙏", L.apologies, nf(ct.apologies))}
    ${row("💪", L.encouragement, nf(ct.encouragement))}
    ${row("❤️", L.love, nf(ct.love))}
    ${row("🌶️", L.spice, nf(ct.spice))}
    ${row("🤬", L.swear, nf(ct.swear))}
    ${row("🔗", L.url, nf(ct.urls))}
    ${row("🔁", L.doubles, nf(ct.doubles))}
    ${row("📌", L.streak, `${nf(ct.longest_streak)} ${L.streakUnit}`)}</section>`);

  if (p.media_total) {
    const rows = Object.entries(p.media).sort((a, b) => b[1] - a[1])
      .map(([t, n]) => row(MEDIA_IC[t] ?? "📎", L.media[t] ?? t, nf(n))).join("");
    out.push(`<section><h2><span class="ic">📎</span>${esc(L.mediaH)} <small>(${nf(p.media_total)})</small></h2>${rows}</section>`);
  }

  const ip = dyn.immediate_pct[sender];
  out.push(`<section><h2><span class="ic">⚡</span>${esc(L.pTiming)}</h2>
    ${row("⏰", L.pActiveHour, hour2(champions.peak_hour[sender]))}
    ${row("⚡", L.immediate, ip == null ? "—" : `%${ip}`)}
    ${row("🚀", L.firstResp, hms(dyn.first_response_secs[sender]))}
    ${row("⏱️", L.pReplyMed, hms(dyn.reply_median_secs[sender]))}
    ${row("🕰️", L.pReplyMean, hms(dyn.reply_mean_secs[sender]))}</section>`);
  out.push(`<section><h2><span class="ic">🥇</span>${esc(L.pChamp)}</h2>
    ${row("☀️", L.pStartsDay, `${nf(champions.first_texter[sender])} ${L.daysWord}`)}
    ${row("🌙", L.pEndsDay, `${nf(champions.last_texter[sender])} ${L.daysWord}`)}</section>`);

  return out.join("\n");
}

// A complete, self-contained HTML document (CSS inlined) — used by Download / PNG export.
export function fullDocument(stats, css, wide = false, lang = "tr") {
  const title = `${stats.core.senders.join(", ")} — WhatsApp`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${css}</style></head>
<body><div class="report${wide ? " wide" : ""}">${reportHTML(stats, lang)}</div></body></html>`;
}
