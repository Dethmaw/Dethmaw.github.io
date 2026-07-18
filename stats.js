// Message statistics for the WhatsApp report — the sole implementation (formerly a port of a
// Python reference, since removed). Verified by test.mjs self-consistency invariants.
// The `laughs` count is split into `laughs_emojis` (a laugh emoji) and `laughs_randoms`
// (classic haha/hehe/kkk or keyboard-mash), mutually exclusive, emoji-first.

// ── constants (mirror the Python) ──────────────────────────────────────────────
export const CONVO_GAP = 4 * 3600; // gap (s) after which the next message starts a new conversation
const REACH_OUT_GAP = 7 * 86400; // silence (s) after which the next message is a "reach out"
const IMMEDIATE_REPLY = 60; // a reply faster than this (s) is "immediate"
const PTS_BASE = 10, PTS_WORD = 2, PTS_MEDIA = 15, PTS_EMOJI = 3;
const STAR_THRESHOLDS = [[40, 5], [20, 4], [8, 3], [3, 2]]; // score → stars, first match wins, else 1

const EMOJI = /[\u{1f300}-\u{1faff}\u{2600}-\u{27bf}\u{1f1e6}-\u{1f1ff}\u{2b00}-\u{2bff}]/gu;
const WORD = /[\p{L}\p{N}_]+/gu; // Unicode \w — JS \w is ASCII-only, which would miss Turkish letters
const URL = /https?:\/\/\S+|www\.\S+/gi;
const ALPHA = /^\p{L}+$/u;
const STOP = new Set(
  ("bir bu ve da de ki mi mı mu mü ama için çok ne o var yok ben sen biz siz onu şey gibi " +
    "ama the a an and to of in is it you i we me my is are was for on that this with").split(" ")
);

const LAUGH_EMOJI = new Set("😂🤣😹😆");
const LAUGH_RE = /(?:a?ha){2,}|(?:a?he){2,}|(?:hi){2,}|(?:ja){2,}|(?:ah){2,}|k{3,}/;
const VOWELS = new Set("aeıioöuüâîû");

// Keyword detection. Substring `stems` for safe
// multi-char forms; whole-token `words` for short/ambiguous tokens that would misfire as substrings
// ("sik" in "klasik", "hayat" in "hayat güzel", "gaz" in "gazete"). ponytail: no morphology — a
// rough tally, tune the lists; some false pos/neg accepted.
const APOLOGY = [
  "özür", "özür dilerim", "özür diliyorum", "özr", "ozr", "pardon", "kusura bakma", "kusura bakmayın",
  "affet", "beni affet", "affedersin", "afedersin", "af buyur", "hakkını helal et", "üzgünüm",
  "çok üzgünüm", "pişmanım", "pişman oldum", "yanlış yaptım", "hata yaptım", "hatalıyım",
  "kabahat bende", "suç bende", "haklısın", "haklıydın", "telafi edeceğim", "bir daha olmayacak",
  "tekrar etmeyecek", "sorry", "my bad",
];
const ENCOURAGE = [
  "aferin", "bravo", "helal", "helal olsun", "harikasın", "mükemmelsin", "efsanesin", "kralsın",
  "kraliçesin", "adamsın", "adamın dibisin", "cansın", "iyi ki varsın", "gurur duyuyorum", "gurur duydum",
  "gurur duy", "tebrik", "tebrikler", "kutlarım", "başarılar", "başaracaksın", "başarırsın", "yaparsın",
  "halledeceksin", "hallederiz", "güveniyorum", "inanıyorum", "yanındayım", "arkandayım", "destekliyorum",
  "pes etme", "devam et", "devam", "hadi bakalım", "gaza gel", "gaza", "kolay gelsin", "elinize sağlık",
  "eline sağlık", "ellerine sağlık", "çok iyisin", "süpersin", "muhteşemsin", "iyisin", "iyiyiz",
  "güçlüsün", "başarılısın", "başarabilirsin", "hll",
];
const ENCOURAGE_WORDS = new Set("gaz hadi".split(" ")); // "gaz" fires in "gazete/gazoz"; "hadi" alone
const THANKS = [
  "teşekkür", "çok sağ ol", "sağ ol", "sağolasın", "sağol", "eyvallah", "eyw", "minnettar",
  "emeğine sağlık", "eline sağlık", "ellerine sağlık", "var ol", "thanks", "thx",
];
const THANKS_WORDS = new Set(["ty"]); // "ty" fires inside many English words
const SAD = [
  "üzgünüm", "moralim bozuk", "kötüyüm", "berbat", "mahvoldum", "bittim", "yoruldum", "ağlıyorum",
  "ağladım", "çok kötüyüm", "canım sıkkın", "mutsuzum", "yalnızım",
];
const CELEBRATION = [
  "iyi ki doğdun", "doğum günün", "kutlu olsun", "bayramın", "hayırlı olsun", "tebrikler",
  "helal olsun", "nice yıllara", "mutluluklar",
];
const LOVE = [
  "seni sev", "seviyorum", "seviyom", "seviyrm", "aşkım", "aşkim", "askim", "canım", "canim",
  "hayatım", "hayatim", "bebeğim", "bebegim", "bir tanem", "birtanem", "biricik", "sevgilim",
  "kalbim", "gülüm", "cicim", "tatlım", "prensesim", "aslanım", "meleğim", "canımsın",
  "iyi ki varsın", "iyi ki hayatımdasın", "iyi ki benimsin", "özledim", "özlüyorum", "yanında olmak",
  "sarılmak istiyorum", "öpüyorum", "öptüm", "öpücük", "kocaman öp", "iyi geceler aşk", "günaydın aşk",
  "bitanem", "karıcım", "kocacım", "balım", "balim", "bebe", "bebiş", "bebis", "minnoş", "minnos",
  "kuzum", "paşam", "sevdim seni",
];
const LOVE_WORDS = new Set(["hayat"]); // "hayat" (life) fires in "hayat güzel"/"iş hayatı" as substring
// Turkish negation of the love verbs (sev-/özle-): the negative morpheme -m(V)- immediately after
// the root — "sevmiyorum", "sevmem", "sevmedim", "sevmez", "sevme", "özlemedim". Positive forms put
// a vowel after the root ("seviyorum", "özledim", "sevdim"), so they do NOT match. Used to drop a
// love hit when the message negates the verb (the broad "seni sev" stem otherwise matches "seni
// sevmiyorum"). ponytail: verb-morpheme only, not a full analyzer — noun negation ("aşkım
// değilsin") and the other positive categories are out (see worklog Deferred).
const LOVE_NEG = /(?<!\p{L})(?:sev|özle)m(?:[iıuü]yor|[ae]z|[ae]d[iı]|[ae]m|[ae]yece|[ae]yaca|[ae](?!\p{L}))/u;
export const loveNegated = (text) => LOVE_NEG.test(text.toLowerCase());
const SPICE = [
  "seksi", "sex", "cinsel", "seviş", "öpüş", "öp beni", "öpiyim", "öpim", "sarıl", "sarıl bana",
  "dokun", "dokun bana", "kokunu", "koklamak", "tenin", "dudak", "boynunu", "boynum", "belin",
  "yatağa", "yatak", "yorgan", "çıplak", "çıplığım", "soyun", "üstünü çıkar", "sutyen", "külot",
  "iç çamaşırı", "azdım", "azıyorum", "azdır", "tahrik", "tahrik oldum", "tahrik ediyorsun",
  "libido", "orgazm", "boşal", "boşaldım", "ereksiyon", "yatakta", "kucağına", "kucağım",
  "koynuna", "koynuma", "memen", "göğsün", "kalçan", "kalçam", "popon", "popom", "götünü", "götüm",
  "özel foto", "nude", "çıplak foto", "foto at", "video aç", "kameranı aç",
  "koyn", "masaj", "hadi gel", "iç çamaşır",
];
const SPICE_WORDS = new Set("seks sert".split(" ")); // "seks"→"seksen"(80), "sert"→"sertifika"
// Flirty / sexting-signal phrases — the real "spice"; counted toward the spice tally.
const FLIRTY = [
  "yanımda ol", "yanına gelsem", "gel yanıma", "gel buraya", "sana sarılmak", "seni öpmek",
  "seni koklamak", "seni istiyorum", "dayanamıyorum", "çok güzelsin", "çok yakışıklısın",
  "aklımdan çıkmıyorsun", "aklımdasın", "rüyama girdin", "beni delirtiyorsun", "beni mahvediyorsun",
  "çok tatlısın", "yerim seni", "ısırırım", "ısırcam", "yicem", "yalarım",
];
const SWEAR_STEMS = [
  "orospu", "amına", "amcık", "amcik", "ananı", "ananin", "avradını", "götveren", "gavat", "pezevenk",
  "kahpe", "kahbe", "şerefsiz", "yarrak", "yarak", "yarra", "ibne", "puşt", "pust", "piç",
  "dallama", "gerizekalı", "salak", "aptal", "hassiktir", "hasiktir", "siktir", "sikey",
  "siktim", "sikik", "yavşak", "lavuk", "it herif", "eşşek", "essek", "kaltak",
];
// Short/ambiguous swear tokens matched WHOLE (so they don't fire inside ordinary words) — the
// common abbreviations plus "pic" (in "epic/topic") and "sikim" (in "eksikim").
const SWEAR_WORDS = new Set("amk aq mk sik göt bok mal oç pic sikim piç".split(" "));
// Emoji signals — in chat, emoji beat keywords. Love/spice emojis count toward those tallies
// directly. Sets hold base code points (variation selector U+FE0F stripped, so ✔️/☺️ can't leak).
const LOVE_EMOJIS = ["❤️", "❤", "💕", "💖", "💘", "💝", "🥰", "😍", "😘", "😚", "😙", "💋", "🫶", "🤍", "💞"];
const SPICE_EMOJIS = ["😏", "🥵", "🔥", "🍑", "🍆", "👅", "💦", "😈", "🫦", "🤤"];
const codeSet = (arr) => new Set(arr.flatMap((e) => [...e]).filter((ch) => ch !== "\uFE0F"));
const LOVE_EMOJI_SET = codeSet(LOVE_EMOJIS);
const SPICE_EMOJI_SET = codeSet(SPICE_EMOJIS);
const SPICE_ALL = SPICE.concat(FLIRTY);
// Innocent homographs that start with a spice stem but are not spice: "boşalt-" (to empty — çamaşır/
// çöp boşaltmak) vs "boşal-" (climax). A token beginning with any of these never counts as spice.
const SPICE_EXCLUDE = ["boşalt"];
const emojiHits = (text, set) => { let n = 0; for (const ch of text) if (set.has(ch)) n++; return n; };
// Severity weighting (mirrored in Python). love/spice/swear score per message = 3 if a "strong"
// term is present (explicit declaration / heavy insult), else 1 for a normal hit (mild word/emoji),
// else 0 — so "seni seviyorum"/"orospu" outweigh "❤️"/"salak" instead of all counting as 1. Strong
// lists are safe multi-char substrings.
const LOVE_STRONG = [
  "seni sev", "seviyorum", "seviyom", "seviyrm", "aşkım", "aşkim", "askim", "bir tanem", "birtanem",
  "sevdim seni", "iyi ki hayatımdasın", "iyi ki benimsin", "canımsın", "hayatım", "hayatim",
];
const SPICE_STRONG = [
  "seviş", "orgazm", "boşal", "çıplak", "nude", "azdım", "azıyorum", "tahrik", "ereksiyon", "libido",
  "memen", "götünü", "koynuna", "koynuma", "soyun", "üstünü çıkar",
];
const SWEAR_STRONG = [
  "orospu", "amına", "amcık", "amcik", "ananı", "ananin", "avradını", "götveren", "pezevenk", "yarrak",
  "yarak", "yarra", "siktir", "sikey", "siktim", "sikik", "kahpe", "kahbe", "şerefsiz", "hassiktir", "hasiktir",
];
const weigh = (low, strong, normalHit) => (strong.some((s) => low.includes(s)) ? 3 : normalHit ? 1 : 0);
// Question detection: literal `?` OR a Turkish question particle. Particle words (mı/mi/mu/mü) and
// clear wh-words matched as WHOLE tokens; attached inflected forms (…mısın/…mıyım/…mıydı) matched
// as token suffixes (≥5 chars, so they don't fire inside ordinary words). Bare "ne"/"kim" are
// deliberately excluded — far too common in non-question use ("ne güzel", "her kim").
const Q_WORDS = new Set(
  "mı mi mu mü nasıl neden niye niçin nerede nereye nereden hangi kaç kaça kaçta".split(" ")
);
const Q_SUFFIX = [
  "mısın", "misin", "musun", "müsün", "mıyım", "miyim", "muyum", "müyüm", "mıyız", "miyiz",
  "muyuz", "müyüz", "mısınız", "misiniz", "musunuz", "müsünüz", "mıydı", "miydi", "muydu", "müydü",
  "mıymış", "miymiş", "muymuş", "müymüş",
];

export const TIME_BLOCKS = ["Sabaha karşı", "Sabah", "Öğleden sonra", "Akşam", "Gece"];
export const TR_DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

// ── small helpers ──────────────────────────────────────────────────────────────
const cplen = (s) => [...s].length; // code-point length, matching Python len() (astral emoji = 1)
const weekday = (d) => (d.getDay() + 6) % 7; // JS Sun=0 → Python Mon=0
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const secs = (a, b) => (b.getTime() - a.getTime()) / 1000;
const sum = (a) => a.reduce((x, y) => x + y, 0);
const mean = (a) => (a.length ? sum(a) / a.length : null);

function median(a) {
  if (!a.length) return null;
  const v = [...a].sort((x, y) => x - y);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const round1 = (x) => (x === null ? null : Math.round(x * 10) / 10);
const round0 = (x) => (x === null ? null : Math.round(x));

function words(m) {
  return m.text.toLowerCase().match(WORD) ?? [];
}

function isMash(tok) {
  if (tok.length < 6 || !ALPHA.test(tok)) return false;
  const t = tok.toLowerCase();
  if (new Set(t).size / t.length < 0.4) return true; // highly repetitive: finger-mash laugh
  if (t.length < 8) return false; // vowel/consonant-run signals misfire on short jargon
  const chars = [...t];
  const vowelRatio = chars.filter((c) => VOWELS.has(c)).length / chars.length;
  let run = 0, maxRun = 0;
  for (const c of chars) {
    run = VOWELS.has(c) ? 0 : run + 1;
    maxRun = Math.max(maxRun, run);
  }
  return vowelRatio < 0.22 || maxRun >= 4;
}

// laugh source of a message: "emoji" (a laugh emoji, takes precedence), "random" (classic
// pattern or keyboard-mash), or null.
export function laughKind(text) {
  if ([...text].some((ch) => LAUGH_EMOJI.has(ch))) return "emoji";
  const low = text.toLowerCase();
  if (LAUGH_RE.test(low)) return "random";
  return (low.match(WORD) ?? []).some(isMash) ? "random" : null;
}

// Detection over a message: substring stems + whole-token set + token-suffix match. `toks` is the
// lowercased word tokens (from words()).
function detectHit(low, toks, { stems, words: wordset, suffix } = {}) {
  if (stems && stems.some((s) => low.includes(s))) return true;
  if (wordset) for (const t of toks) if (wordset.has(t)) return true;
  if (suffix) for (const t of toks) if (suffix.some((sf) => t.endsWith(sf))) return true;
  return false;
}
// Boundary-aware stem match: a single-token stem matches a WORD token only when the token STARTS
// with the stem, so inflections count ("götüm"→"götümü", "sarıl"→"sarıldı") but a stem embedded
// mid-word does NOT ("azdım"≠"yazdım", "tenin"≠"sitenin", "ahr"≠"jahrein"). Multi-word stems keep
// substring matching (specific enough). Tokens starting with an `exclude` prefix are innocent
// homographs ("boşalt-" = to empty, vs "boşal-" = climax) and never match.
function stemHitBoundary(low, toks, stems, exclude = []) {
  for (const s of stems) {
    if (s.includes(" ")) { if (low.includes(s)) return true; }
    else if (toks.some((t) => t.startsWith(s) && !exclude.some((x) => t.startsWith(x)))) return true;
  }
  return false;
}
// Exported for tests: does the text trigger a spice stem/word? (emoji handled separately by callers)
export function spiceWordHit(text) {
  const low = text.toLowerCase();
  const toks = low.match(WORD) ?? [];
  return stemHitBoundary(low, toks, SPICE_ALL, SPICE_EXCLUDE) || toks.some((t) => SPICE_WORDS.has(t));
}
export const isQuestion = (text, toks) =>
  text.includes("?") || detectHit(text.toLowerCase(), toks, { words: Q_WORDS, suffix: Q_SUFFIX });

// Merge bigram + trigram counts into the top-n non-overlapping "common phrases". A frequent
// trigram "a b c" would otherwise surface as its two bigrams "a b" and "b c", so subtract each
// selected trigram's count from its two constituent bigrams and keep a bigram only if its residual
// count is still >= 2. Trigrams (n>=2) win on ties because they are listed first before the stable
// sort. `bi`/`tri` are Maps of phrase→count; returns [[phrase, n], …] sorted by count desc.
export function commonPhrases(bi, tri, n) {
  const tris = [...tri.entries()].filter(([, c]) => c >= 2);
  const resid = new Map(bi);
  for (const [p, c] of tris) {
    const [a, b, cc] = p.split(" ");
    for (const sub of [`${a} ${b}`, `${b} ${cc}`]) if (resid.has(sub)) resid.set(sub, resid.get(sub) - c);
  }
  const bis = [...resid.entries()].filter(([, c]) => c >= 2);
  return [...tris, ...bis].sort((x, y) => y[1] - x[1]).slice(0, n);
}
// Convenience for tests: tokenize + detect in one call.
export const questionOf = (text) => isQuestion(text, text.toLowerCase().match(WORD) ?? []);
const timeBlock = (h) => (h < 5 ? 4 : h < 8 ? 0 : h < 12 ? 1 : h < 17 ? 2 : h < 22 ? 3 : 4);

// For a 2-sender count object, return [higher, lower] if higher > factor·lower, else null.
function imbalance(counts, factor = 1.5) {
  const items = Object.entries(counts);
  if (items.length !== 2) return null;
  const [[hi, hv], [lo, lv]] = items.sort((a, b) => b[1] - a[1]);
  return hv > factor * Math.max(1, lv) ? [hi, lo] : null;
}

function ratingLabel(score) {
  if (score >= 80) return "Mükemmel bir ilişki";
  if (score >= 60) return "Çok iyi bir ilişki";
  if (score >= 40) return "İyi bir ilişki";
  if (score >= 20) return "İdare eder bir ilişki";
  return "Sessiz bir ilişki";
}

export function segmentConversations(messages) {
  const segments = [];
  for (const m of messages) {
    const last = segments.at(-1)?.at(-1);
    if (!last || secs(last.when, m.when) > CONVO_GAP) segments.push([m]);
    else segments.at(-1).push(m);
  }
  return segments;
}

// Turkish Key-Insights rule engine (tuned for 2-person chats).
function buildInsights(stats, laughsTotal) {
  const senders = stats.core.senders;
  if (senders.length !== 2) return [];
  const { core, dynamics: dyn, content, conversations: conv, scoring: sc, champions: ch } = stats;
  // Each tip is a { tr, en } object so the render layer can show it in either language.
  const tips = [];
  const EN_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const EN_BLOCKS = ["early morning", "morning", "afternoon", "evening", "night"];
  const [A, B] = senders;
  const nightly = (h) => h != null && (h >= 22 || h < 5);
  const early = (h) => h != null && h >= 5 && h < 9;

  // Headline "character" insights first.
  if (sc.chat_rating >= 80)
    tips.push({ tr: "Harika bir uyumunuz var — sohbet puanı çok yüksek!", en: "Great chemistry — your chat rating is very high!" });
  if (Math.abs((sc.balance[A] ?? 50) - (sc.balance[B] ?? 50)) < 5)
    tips.push({ tr: "Çok dengeli bir ilişki; katkı neredeyse eşit.", en: "A very balanced relationship; contribution is nearly equal." });
  const yrs = Math.floor(core.span_days / 365);
  if (yrs >= 1)
    tips.push({ tr: `${yrs} yıldan uzun süredir konuşuyorsunuz.`, en: `You've been chatting for over ${yrs} year${yrs > 1 ? "s" : ""}.` });
  if (core.msgs_per_day >= 30)
    tips.push({ tr: `Çok konuşkansınız — günde ortalama ${Math.round(core.msgs_per_day)} mesaj.`, en: `You're chatty — about ${Math.round(core.msgs_per_day)} messages a day.` });
  if (core.active_days / core.span_days > 0.7)
    tips.push({ tr: "Neredeyse her gün yazışıyorsunuz.", en: "You message almost every day." });
  if (nightly(ch.peak_hour[A]) && nightly(ch.peak_hour[B]))
    tips.push({ tr: "Gece kuşlarısınız 🦉 — en aktif saatler geç.", en: "You're night owls 🦉 — most active late at night." });
  else if (early(ch.peak_hour[A]) && early(ch.peak_hour[B]))
    tips.push({ tr: "Sabahçısınız 🌅 — güne erken başlıyorsunuz.", en: "Early birds 🌅 — you start the day early." });

  let imb = imbalance(dyn.starters);
  if (imb) tips.push({ tr: `${imb[0]} konuşmaların çoğunu başlatıyor; ${imb[1]} daha sık ilk adımı atabilir.`, en: `${imb[0]} starts most conversations; ${imb[1]} could take the first step more often.` });
  imb = imbalance(Object.fromEntries(senders.map((s) => [s, content[s].questions])));
  if (imb) tips.push({ tr: `${imb[1]}, ${imb[0]} kadar soru sormuyor; daha meraklı olabilir.`, en: `${imb[1]} asks fewer questions than ${imb[0]}; could show more curiosity.` });
  imb = imbalance(Object.fromEntries(senders.map((s) => [s, content[s].apologies])));
  if (imb) tips.push({ tr: `Özürlerin çoğunu ${imb[0]} diliyor.`, en: `${imb[0]} does most of the apologising.` });
  imb = imbalance(Object.fromEntries(senders.map((s) => [s, content[s].encouragement])));
  if (imb) tips.push({ tr: `Teşvik ve destek daha çok ${imb[0]}'ten geliyor; ${imb[1]} daha fazla destekleyebilir.`, en: `Most of the encouragement comes from ${imb[0]}; ${imb[1]} could be more supportive.` });
  imb = imbalance(Object.fromEntries(senders.map((s) => [s, content[s].doubles])));
  if (imb) tips.push({ tr: `${imb[0]} daha çok peş peşe mesaj (double text) atıyor.`, en: `${imb[0]} double-texts more.` });
  imb = imbalance(Object.fromEntries(senders.map((s) => [s, laughsTotal[s]])));
  if (imb) tips.push({ tr: `${imb[0]} sohbette daha çok gülüyor.`, en: `${imb[0]} laughs the most in the chat.` });

  // ── love / spice / swear character (uses the new detection counters) ──
  const loveTot = content[A].love + content[B].love;
  // Only call it "love-filled" when love is a genuinely notable share of messages (≥1.5%), so it
  // doesn't fire on nearly every chat.
  if (core.total && loveTot / core.total >= 0.015)
    tips.push({ tr: "Sohbet sevgi dolu ❤️ — bol bol tatlı söz var.", en: "This chat is full of love ❤️ — lots of sweet words." });
  imb = imbalance(Object.fromEntries(senders.map((s) => [s, content[s].love])));
  if (imb) tips.push({ tr: `${imb[0]} daha çok tatlı söz ediyor; ${imb[1]} biraz hödük.`, en: `${imb[0]} uses more terms of endearment; ${imb[1]} is a bit more reserved.` });
  imb = imbalance(Object.fromEntries(senders.map((s) => [s, content[s].spice])));
  if (imb) tips.push({ tr: `Sohbete tutkuyu daha çok ${imb[0]} katıyor 🌶️.`, en: `${imb[0]} brings most of the passion 🌶️.` });
  const swearTot = content[A].swear + content[B].swear;
  if (core.total && swearTot / core.total >= 0.08)
    tips.push({ tr: "Ağzı bozuk bir ikilisiniz 🤬 — küfür sohbetin tuzu biberi.", en: "You're a foul-mouthed duo 🤬 — swearing is your seasoning." });
  imb = imbalance(Object.fromEntries(senders.map((s) => [s, content[s].swear])));
  if (imb) tips.push({ tr: `${imb[0]} daha çok küfrediyor; ${imb[1]} çok daha sakin ağızlı.`, en: `${imb[0]} swears more; ${imb[1]} has a much cleaner mouth.` });

  // Recent trend: are they talking more or less lately (last 3 months vs. the months before)?
  const bm = stats.time.by_month;
  if (bm.length >= 6) {
    const rAvg = mean(bm.slice(-3).map(([, n]) => n)), pAvg = mean(bm.slice(0, -3).map(([, n]) => n));
    if (pAvg > 0 && rAvg / pAvg >= 1.4) tips.push({ tr: "Son aylarda çok daha sık yazışıyorsunuz 📈.", en: "You've been messaging much more lately 📈." });
    else if (pAvg > 0 && rAvg / pAvg <= 0.6) tips.push({ tr: "Son aylarda eskisi kadar yazışmıyorsunuz 📉.", en: "You don't message as much as you used to lately 📉." });
  }
  const streakMax = Math.max(content[A].longest_streak, content[B].longest_streak);
  if (streakMax >= 10) {
    const who = content[A].longest_streak >= content[B].longest_streak ? A : B;
    tips.push({ tr: `${who} bir keresinde yanıt beklemeden arka arkaya ${streakMax} mesaj attı.`, en: `${who} once fired off ${streakMax} messages in a row without waiting for a reply.` });
  }
  imb = imbalance(Object.fromEntries(senders.map((s) => [s, dyn.immediate_pct[s] ?? 0])), 1.3);
  if (imb) tips.push({ tr: `${imb[1]} mesajlara ${imb[0]}'e göre daha yavaş yanıt veriyor.`, en: `${imb[1]} replies slower than ${imb[0]}.` });
  if (sum(senders.map((s) => conv.reach_outs[s])) <= 1)
    tips.push({ tr: "Uzun sessizliklerden sonra yeniden yazışmak için ilk adımı atmayı deneyin.", en: "Try being the one to reach out again after a long silence." });
  if (sum(senders.map((s) => content[s].ignored)) > 0)
    tips.push({ tr: "Bazı sorular konuşma biterken yanıtsız kalıyor; okunmuş bırakmamaya dikkat.", en: "Some questions go unanswered as conversations end; watch out for leaving on read." });

  // Champion / style insights.
  imb = imbalance(ch.first_texter);
  if (imb) tips.push({ tr: `Günaydını genelde ${imb[0]} diyor (günü başlatan).`, en: `${imb[0]} usually says good morning (starts the day).` });
  imb = imbalance(ch.last_texter);
  if (imb) tips.push({ tr: `İyi geceleri genelde ${imb[0]} diyor.`, en: `${imb[0]} usually says good night.` });
  imb = imbalance({ [A]: core.per_sender[A].media_total, [B]: core.per_sender[B].media_total });
  if (imb) tips.push({ tr: `${imb[0]} daha çok medya (fotoğraf/video) paylaşıyor.`, en: `${imb[0]} shares more media (photos/videos).` });
  imb = imbalance({ [A]: core.per_sender[A].avg_words, [B]: core.per_sender[B].avg_words }, 1.3);
  if (imb) tips.push({ tr: `${imb[0]} daha uzun mesajlar yazıyor.`, en: `${imb[0]} writes longer messages.` });
  const totLaugh = laughsTotal[A] + laughsTotal[B];
  const emoLaugh = content[A].laughs_emojis + content[B].laughs_emojis;
  if (totLaugh > 20 && emoLaugh / totLaugh < 0.15)
    tips.push({ tr: "Gülerken emoji yerine random atmayı seviyorsunuz.", en: "You laugh with the keyboard, not emoji (ahaha/asdfgh)." });

  const grid = stats.time.heatmap.grid;
  let peak = [0, 0];
  for (let b = 0; b < 5; b++)
    for (let d = 0; d < 7; d++)
      if (grid[b][d] > grid[peak[0]][peak[1]]) peak = [b, d];
  tips.push({
    tr: `En yoğun sohbet zamanı: ${TR_DAYS[peak[1]]} günü ${TIME_BLOCKS[peak[0]].toLowerCase()}.`,
    en: `Busiest time: ${EN_BLOCKS[peak[0]]} on ${EN_DAYS[peak[1]]}.`,
  });
  return tips;
}

export function computeStats(messages) {
  if (!messages.length) throw new Error("no messages to analyze");
  messages = [...messages].sort((a, b) => a.when - b.when);
  const senders = [...new Set(messages.map((m) => m.sender))].sort();
  const zero = () => Object.fromEntries(senders.map((s) => [s, 0]));

  const first = messages[0].when, last = messages.at(-1).when;
  const dayMs = 86400000;
  const dOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const spanDays = Math.max(1, Math.round((dOnly(last) - dOnly(first)) / dayMs) + 1);
  const activeDays = new Set(messages.map((m) => dayKey(m.when))).size;

  const perSender = {};
  for (const s of senders) {
    const msgs = messages.filter((m) => m.sender === s);
    const wc = sum(msgs.map((m) => words(m).length));
    const chars = sum(msgs.map((m) => cplen(m.text)));
    const media = {};
    for (const m of msgs) if (m.media) media[m.media] = (media[m.media] ?? 0) + 1;
    perSender[s] = {
      messages: msgs.length,
      words: wc,
      chars,
      avg_words: msgs.length ? round1(wc / msgs.length) : 0,
      avg_chars: msgs.length ? round1(chars / msgs.length) : 0,
      media,
      media_total: sum(Object.values(media)),
    };
  }

  // Starters + reply times + double messages (one walk over consecutive messages). Reply deltas are
  // also bucketed by month for the reply-time trend (chat-level, both senders).
  const starters = zero(), doubles = zero();
  const replySecs = Object.fromEntries(senders.map((s) => [s, []]));
  const replyByMonth = new Map();
  starters[messages[0].sender] += 1;
  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1], cur = messages[i];
    const delta = secs(prev.when, cur.when);
    if (delta > CONVO_GAP) starters[cur.sender] += 1;
    else if (cur.sender !== prev.sender) {
      replySecs[cur.sender].push(delta);
      const mk = `${cur.when.getFullYear()}-${cur.when.getMonth() + 1}`;
      (replyByMonth.get(mk) ?? replyByMonth.set(mk, []).get(mk)).push(delta);
    } else doubles[cur.sender] += 1;
  }

  const segments = segmentConversations(messages);
  const ended = zero();
  for (const seg of segments) ended[seg.at(-1).sender] += 1;
  const reachOuts = zero();
  for (let i = 1; i < segments.length; i++)
    if (secs(segments[i - 1].at(-1).when, segments[i][0].when) > REACH_OUT_GAP)
      reachOuts[segments[i][0].sender] += 1;

  // A message for display (openers / on-this-day / silence): sender + trimmed text + media type.
  const dispMsg = (m, n) => ({ sender: m.sender, text: [...m.text].slice(0, n).join(""), media: m.media });

  const longest = messages.reduce((a, b) => (cplen(b.text) > cplen(a.text) ? b : a));
  let longestGap = null;
  for (let i = 1; i < messages.length; i++) {
    const g = secs(messages[i - 1].when, messages[i].when);
    if (!longestGap || g > longestGap.secs)
      // `by` = who broke the silence (re-igniter); `after` = who fell silent. `before` is the last
      // message before the silence; `comeback` the first few messages that broke it (for expansion).
      longestGap = {
        secs: g, from: messages[i - 1].when, to: messages[i].when, by: messages[i].sender, after: messages[i - 1].sender,
        before: dispMsg(messages[i - 1], 160), comeback: messages.slice(i, i + 4).map((m) => dispMsg(m, 160)),
      };
  }

  const topEmoji = new Map();
  const topWords = Object.fromEntries(senders.map((s) => [s, new Map()]));
  const topPhrases = Object.fromEntries(senders.map((s) => [s, new Map()])); // bigrams
  const topTrigrams = Object.fromEntries(senders.map((s) => [s, new Map()]));
  const senderEmoji = Object.fromEntries(senders.map((s) => [s, new Map()]));
  const uniqueWords = Object.fromEntries(senders.map((s) => [s, new Set()]));
  const questions = zero(), urls = zero();
  const laughsEmojis = zero(), laughsRandoms = zero();
  const apologies = zero(), encouragement = zero(), chatPoints = zero();
  const love = zero(), spice = zero(), swear = zero();
  const thanks = zero(), sad = zero(), celebration = zero();
  const loveByDay = new Map(); // dayKey → love-word hits + heart-emoji count (for the love-bomb day)
  const loveMsgsByDay = new Map(); // dayKey → up-to-12 love messages that day (for the expandable love-bomb row)
  const moodByMonth = new Map(); // "y-m" → { pos, neg, n } warmth/tension counts (mood over time)
  const bump = (map, k) => map.set(k, (map.get(k) ?? 0) + 1);

  for (const m of messages) {
    const ws = words(m);
    const low = m.text.toLowerCase();
    const emojis = m.text.match(EMOJI) ?? [];
    chatPoints[m.sender] += PTS_BASE + PTS_WORD * ws.length + (m.media ? PTS_MEDIA : 0) + PTS_EMOJI * emojis.length;
    for (const e of emojis) { bump(topEmoji, e); bump(senderEmoji[m.sender], e); }
    for (const w of ws) {
      if (w.length >= 3 && !STOP.has(w)) bump(topWords[m.sender], w);
      uniqueWords[m.sender].add(w);
    }
    // Bigrams + trigrams for "common phrases": consecutive tokens within the message, skipping
    // all-stopword windows (pure glue) and single-char tokens. Stopwords are kept as one side so
    // real phrases ("iyi geceler", "ne yapıyorsun") survive. System notices are skipped (not real
    // text). Trigrams let a frequent 3-word phrase win over its two overlapping bigrams — see
    // commonPhrases() at output time.
    if (!m.system)
      for (let k = 1; k < ws.length; k++) {
        const a = ws[k - 1], b = ws[k];
        if (a.length >= 2 && b.length >= 2 && !(STOP.has(a) && STOP.has(b))) bump(topPhrases[m.sender], `${a} ${b}`);
        if (k >= 2) {
          const z = ws[k - 2];
          if (z.length >= 2 && a.length >= 2 && b.length >= 2 && !(STOP.has(z) && STOP.has(a) && STOP.has(b)))
            bump(topTrigrams[m.sender], `${z} ${a} ${b}`);
        }
      }
    if (isQuestion(m.text, ws)) questions[m.sender] += 1;
    urls[m.sender] += (m.text.match(URL) ?? []).length;
    const lk = laughKind(m.text);
    if (lk === "emoji") laughsEmojis[m.sender] += 1;
    else if (lk === "random") laughsRandoms[m.sender] += 1;
    if (detectHit(low, ws, { stems: APOLOGY })) apologies[m.sender] += 1;
    const encHit = detectHit(low, ws, { stems: ENCOURAGE, words: ENCOURAGE_WORDS });
    if (encHit) encouragement[m.sender] += 1;
    const thxHit = detectHit(low, ws, { stems: THANKS, words: THANKS_WORDS });
    if (thxHit) thanks[m.sender] += 1;
    const sadHit = detectHit(low, ws, { stems: SAD });
    if (sadHit) sad[m.sender] += 1;
    const celebHit = detectHit(low, ws, { stems: CELEBRATION });
    if (celebHit) celebration[m.sender] += 1;
    // Negation-aware love: a message that negates the love verb ("seni sevmiyorum") must not count
    // as love on either the word or the strong-declaration path. Heart emoji still count — an emoji
    // is not negated by the surrounding text.
    const loveNeg = LOVE_NEG.test(low);
    const wordLove = !loveNeg && detectHit(low, ws, { stems: LOVE, words: LOVE_WORDS });
    const loveEmojiN = emojiHits(m.text, LOVE_EMOJI_SET);
    const loveStrong = !loveNeg && LOVE_STRONG.some((s) => low.includes(s));
    const loveW = loveStrong ? 3 : (wordLove || loveEmojiN > 0) ? 1 : 0;
    const loveHit = loveW > 0;
    love[m.sender] += loveW;
    // Boundary-aware spice: both tiers match stems at a word start (see stemHitBoundary), so
    // "yazdım"/"boşalttım"/"sitenin" no longer count while "boşaldım"/"götümü" still do. Emoji count
    // directly. Reuses low/ws (no re-tokenization); spiceWordHit is the same logic, exported for tests.
    const spiceStrong = stemHitBoundary(low, ws, SPICE_STRONG, SPICE_EXCLUDE);
    const spiceNormal = stemHitBoundary(low, ws, SPICE_ALL, SPICE_EXCLUDE) || ws.some((t) => SPICE_WORDS.has(t)) || emojiHits(m.text, SPICE_EMOJI_SET) > 0;
    const spiceW = spiceStrong ? 3 : spiceNormal ? 1 : 0;
    const spiceHit = spiceW > 0;
    spice[m.sender] += spiceW;
    const swearW = weigh(low, SWEAR_STRONG, detectHit(low, ws, { stems: SWEAR_STEMS, words: SWEAR_WORDS }));
    const swearHit = swearW > 0;
    swear[m.sender] += swearW;
    if (loveHit) {
      const dk = dayKey(m.when);
      loveByDay.set(dk, (loveByDay.get(dk) ?? 0) + (wordLove ? 1 : 0) + loveEmojiN);
      let lm = loveMsgsByDay.get(dk);
      if (!lm) { lm = []; loveMsgsByDay.set(dk, lm); }
      if (lm.length < 12) lm.push(dispMsg(m, 160));
    }
    // Mood over time: warmth (love/spice/thanks/celebration/encouragement) vs tension (swear/sad)
    // bucketed by month. A message can count as both; humor is excluded (it's not a mood polarity).
    const mk = `${m.when.getFullYear()}-${m.when.getMonth() + 1}`;
    let mm = moodByMonth.get(mk);
    if (!mm) { mm = { pos: 0, neg: 0, n: 0 }; moodByMonth.set(mk, mm); }
    mm.n += 1;
    if (loveHit || spiceHit || thxHit || celebHit || encHit) mm.pos += 1;
    if (swearHit || sadHit) mm.neg += 1;
  }

  // Longest one-sided streak: the max run of consecutive text messages by the same sender (double-text
  // clinginess). Single walk over the time-sorted messages. Media is skipped from the count so a
  // batch of photos/stickers can't inflate a sender's streak; a sender change still resets the run,
  // so the other person's media still breaks the streak.
  const longestStreak = zero();
  const streakRun = {}; // sender → the message array of that sender's longest run (live ref, keeps growing)
  let runSender = null, run = [];
  for (const m of messages) {
    if (m.sender !== runSender) { runSender = m.sender; run = []; }
    if (!m.media) run.push(m); // ponytail: media doesn't count toward a one-sided streak
    if (run.length > longestStreak[m.sender]) { longestStreak[m.sender] = run.length; streakRun[m.sender] = run; }
  }
  // First up-to-24 messages of each sender's longest run, for the expandable streak milestone.
  const streakMsgs = Object.fromEntries(senders.map((s) => [s, (streakRun[s] ?? []).slice(0, 24).map((m) => dispMsg(m, 160))]));

  // Peak love-bomb day: the day with the most love words + heart emojis.
  let loveBomb = null;
  for (const [k, n] of loveByDay) if (!loveBomb || n > loveBomb.count) loveBomb = { day: k, count: n };
  if (loveBomb) loveBomb.msgs = loveMsgsByDay.get(loveBomb.day) ?? []; // the day's love messages (for the expandable row)

  // Quarter openers: the opening exchange of each calendar quarter — the first up-to-6 non-system
  // messages (time-sorted), so the report can expand a one-liner into the actual conversation.
  const quarterOpeners = new Map();
  for (const m of messages) {
    if (m.system) continue;
    const key = `${m.when.getFullYear()}-Q${Math.floor(m.when.getMonth() / 3) + 1}`;
    let o = quarterOpeners.get(key);
    if (!o) { o = { q: key, sender: m.sender, when: m.when, msgs: [] }; quarterOpeners.set(key, o); }
    if (o.msgs.length < 6) o.msgs.push(dispMsg(m, 240));
  }

  // On this day: messages sent on today's month+day in earlier years (JS-only nostalgia scroll;
  // "today"-relative, so not part of the Python parity reference). Grouped by year (newest first),
  // each keeping the first up-to-6 non-system messages so the section can expand like the openers.
  const today = new Date();
  const md = `${today.getMonth()}-${today.getDate()}`;
  const otdByYear = new Map();
  for (const m of messages)
    if (!m.system && `${m.when.getMonth()}-${m.when.getDate()}` === md && m.when.getFullYear() < today.getFullYear()) {
      const y = m.when.getFullYear();
      if (!otdByYear.has(y)) otdByYear.set(y, { year: y, count: 0, msgs: [] });
      const e = otdByYear.get(y);
      e.count += 1;
      if (e.msgs.length < 6) e.msgs.push(dispMsg(m, 160));
    }
  const onThisDay = otdByYear.size
    ? { md, years: [...otdByYear.values()].sort((a, b) => b.year - a.year) }
    : null;

  const ignored = zero();
  for (const seg of segments) {
    const lastMsg = seg.at(-1);
    if (isQuestion(lastMsg.text, words(lastMsg))) ignored[lastMsg.sender] += 1;
  }

  const firstSecs = Object.fromEntries(senders.map((s) => [s, []]));
  for (const seg of segments) {
    const opener = seg[0];
    for (const m of seg.slice(1)) {
      if (m.sender !== opener.sender) { firstSecs[m.sender].push(secs(opener.when, m.when)); break; }
    }
  }

  const mostCommon = (map, n) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n); // stable: ties keep insertion order

  const content = Object.fromEntries(senders.map((s) => [s, {
    unique_words: uniqueWords[s].size,
    questions: questions[s],
    urls: urls[s],
    doubles: doubles[s],
    ignored: ignored[s],
    laughs_emojis: laughsEmojis[s],
    laughs_randoms: laughsRandoms[s],
    apologies: apologies[s],
    encouragement: encouragement[s],
    love: love[s],
    spice: spice[s],
    swear: swear[s],
    thanks: thanks[s],
    sad: sad[s],
    celebration: celebration[s],
    longest_streak: longestStreak[s],
    streak_msgs: streakMsgs[s], // messages of this sender's longest one-sided run (expandable row)
    emoji_total: sum([...senderEmoji[s].values()]),
    top_emoji: mostCommon(senderEmoji[s], 10),
  }]));

  // Scoring layer (formulas ours). Per-conversation quality rewards depth + reciprocity.
  const stars = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const topContributor = zero(), qualityLevel = zero();
  const segRecips = [];
  for (const seg of segments) {
    const counts = new Map();
    for (const m of seg) counts.set(m.sender, (counts.get(m.sender) ?? 0) + 1);
    const vals = [...counts.values()];
    const recip = counts.size > 1 ? Math.min(...vals) / Math.max(...vals) : 0;
    segRecips.push(recip);
    const score = seg.length * (0.5 + 0.5 * recip);
    const star = STAR_THRESHOLDS.find(([thr]) => score >= thr)?.[1] ?? 1;
    stars[star] += 1;
    const top = [...counts.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0]; // tie → first inserted
    topContributor[top] += 1;
    if (star >= 4) qualityLevel[top] += 1;
  }

  const heatmap = Array.from({ length: 5 }, () => new Array(7).fill(0));
  for (const m of messages) heatmap[timeBlock(m.when.getHours())][weekday(m.when)] += 1;

  // Champions: first/last message of each active day per sender, and each sender's peak hour.
  const byDay = new Map();
  for (const m of messages) {
    const k = dayKey(m.when);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(m);
  }
  const firstTexter = zero(), lastTexter = zero();
  for (const dayMsgs of byDay.values()) { firstTexter[dayMsgs[0].sender] += 1; lastTexter[dayMsgs.at(-1).sender] += 1; }
  const peakHour = {}, nightOwl = {};
  for (const s of senders) {
    const hc = new Map();
    let night = 0, tot = 0;
    for (const m of messages) if (m.sender === s) {
      const h = m.when.getHours();
      hc.set(h, (hc.get(h) ?? 0) + 1);
      tot += 1;
      if (h >= 22 || h < 5) night += 1; // late night 22:00–04:59
    }
    peakHour[s] = hc.size ? mostCommon(hc, 1)[0][0] : null;
    nightOwl[s] = tot ? round1(100 * night / tot) : 0; // % of this sender's messages sent late at night
  }

  // Milestones: the datetime of the Nth message (1-indexed) for the milestone Ns that exist.
  const milestonesNth = {};
  for (const n of [1, 1000, 5000, 10000, 25000, 50000, 100000]) if (n <= messages.length) milestonesNth[n] = messages[n - 1].when;

  const totalPts = sum(senders.map((s) => chatPoints[s]));
  const balance = totalPts ? Object.fromEntries(senders.map((s) => [s, round1(100 * chatPoints[s] / totalPts)])) : {};
  const balVals = Object.values(balance);
  const balanceScore = balVals.length ? Math.max(0, 100 - (Math.max(...balVals) - Math.min(...balVals))) : 0;
  const recipScore = segRecips.length ? 100 * mean(segRecips) : 0;
  const consistency = 100 * activeDays / spanDays;
  const engagement = segments.length ? Math.min(100, 2 * messages.length / segments.length) : 0;
  let chatRating = Math.round(0.3 * balanceScore + 0.3 * recipScore + 0.2 * consistency + 0.2 * engagement);
  chatRating = Math.max(0, Math.min(100, chatRating));

  const byHour = {};
  for (const m of messages) byHour[m.when.getHours()] = (byHour[m.when.getHours()] ?? 0) + 1;
  const byWeekday = {};
  for (let d = 0; d < 7; d++) byWeekday[d] = 0;
  for (const m of messages) byWeekday[weekday(m.when)] += 1;
  const byMonth = new Map();
  for (const m of messages) {
    const k = `${m.when.getFullYear()}-${m.when.getMonth() + 1}`;
    byMonth.set(k, (byMonth.get(k) ?? 0) + 1);
  }
  const busiest = mostCommon(
    (() => { const c = new Map(); for (const m of messages) bump(c, dayKey(m.when)); return c; })(), 1
  )[0];

  // Longest streak of consecutive active days (calendar days with ≥1 message). Day ordinal via
  // Date.UTC so DST can't shift the "+1 day" check.
  const dayNum = (d) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / dayMs);
  const uniqDays = [...new Map(messages.map((m) => [dayKey(m.when), dOnly(m.when)])).values()].sort((a, b) => a - b);
  let dayRun = 1, dayBest = 1, dayRunFrom = uniqDays[0], streakFrom = uniqDays[0], streakTo = uniqDays[0];
  for (let i = 1; i < uniqDays.length; i++) {
    if (dayNum(uniqDays[i]) === dayNum(uniqDays[i - 1]) + 1) dayRun++;
    else { dayRun = 1; dayRunFrom = uniqDays[i]; }
    if (dayRun > dayBest) { dayBest = dayRun; streakFrom = dayRunFrom; streakTo = uniqDays[i]; }
  }
  const activeStreak = { days: dayBest, from: streakFrom, to: streakTo };

  // Chronological sort for "y-m" keyed entries (numeric, so month 10 doesn't precede month 2).
  const monthSort = (a, b) => { const [ay, am] = a[0].split("-").map(Number), [by, bm] = b[0].split("-").map(Number); return ay - by || am - bm; };

  // Longest conversation (the "marathon" session): the segment with the most messages. Keep the
  // first up-to-10 non-system messages for an expandable replay.
  const longestConvo = segments.reduce((a, b) => (b.length > a.length ? b : a), segments[0] ?? []);
  const longestConvoOut = longestConvo.length ? {
    count: longestConvo.length,
    from: longestConvo[0].when,
    to: longestConvo.at(-1).when,
    msgs: longestConvo.filter((m) => !m.system).slice(0, 10).map((m) => dispMsg(m, 200)),
  } : null;

  // Memories pool for the "random memory" shuffle: substantial older text messages, sampled evenly
  // across the timeline (deterministic; the client shuffles among them). Non-system, non-media, ≥15 chars.
  const memPool = messages.filter((m) => !m.system && !m.media && cplen(m.text) >= 15);
  const memStep = Math.max(1, Math.floor(memPool.length / 24));
  const memories = [];
  for (let i = 0; i < memPool.length && memories.length < 24; i += memStep)
    memories.push({ sender: memPool[i].sender, text: [...memPool[i].text].slice(0, 200).join(""), when: memPool[i].when });

  const laughsTotal = Object.fromEntries(senders.map((s) => [s, laughsEmojis[s] + laughsRandoms[s]]));

  // First real (non-system) message — the chat's opening line, for the "where it started" slide.
  const firstReal = messages.find((m) => !m.system);
  const firstMessage = firstReal ? { sender: firstReal.sender, text: [...firstReal.text].slice(0, 180).join(""), when: firstReal.when } : null;
  // 3AM club: the latest-into-the-small-hours message (00:00–05:59), i.e. the closest anyone got to dawn.
  let latestNight = null, latestNightT = -1;
  for (const m of messages) {
    if (m.system) continue;
    const h = m.when.getHours();
    if (h < 6) { const t = h * 60 + m.when.getMinutes(); if (t > latestNightT) { latestNightT = t; latestNight = { sender: m.sender, text: [...m.text].slice(0, 120).join(""), when: m.when }; } }
  }

  const result = {
    core: {
      total: messages.length,
      senders,
      per_sender: perSender,
      media: (() => { const c = {}; for (const m of messages) if (m.media) c[m.media] = (c[m.media] ?? 0) + 1; return c; })(),
      media_total: messages.filter((m) => m.media).length,
      edited: messages.filter((m) => m.edited).length,
      first, last,
      span_days: spanDays,
      active_days: activeDays,
      msgs_per_day: round1(messages.length / spanDays),
    },
    time: {
      by_hour: byHour,
      // sort by (year, month) numerically — a plain string sort puts "2024-10" before "2024-2".
      by_month: [...byMonth.entries()].sort(monthSort),
      by_weekday: byWeekday,
      busiest_day: busiest, // [dayKey, count]
      active_streak: activeStreak, // { days, from, to } — longest run of consecutive active days
      longest_gap: longestGap,
      // mood over time: [ "y-m", warmth, tension, msgs ] per month, chronological
      mood: [...moodByMonth.entries()].map(([k, v]) => [k, v.pos, v.neg, v.n]).sort(monthSort),
      // reply-time trend: [ "y-m", median reply seconds, reply count ] per month, chronological
      reply_trend: [...replyByMonth.entries()].map(([k, arr]) => [k, round0(median(arr)), arr.length]).sort(monthSort),
      heatmap: { blocks: TIME_BLOCKS, days: TR_DAYS, grid: heatmap },
    },
    conversations: {
      total: segments.length,
      ended: Object.fromEntries(senders.map((s) => [s, ended[s]])),
      reach_outs: Object.fromEntries(senders.map((s) => [s, reachOuts[s]])),
    },
    content,
    scoring: {
      chat_points: Object.fromEntries(senders.map((s) => [s, chatPoints[s]])),
      chat_points_total: totalPts,
      balance,
      stars,
      top_contributor: Object.fromEntries(senders.map((s) => [s, topContributor[s]])),
      quality_level: Object.fromEntries(senders.map((s) => [s, qualityLevel[s]])),
      chat_rating: chatRating,
      chat_rating_label: ratingLabel(chatRating),
      // Compatibility breakdown: the four normalized signals behind chat_rating (0–100 each).
      rating_parts: { balance: round0(balanceScore), reciprocity: round0(recipScore), consistency: round0(consistency), engagement: round0(engagement) },
    },
    dynamics: {
      starters: Object.fromEntries(senders.map((s) => [s, starters[s]])),
      reply_median_secs: Object.fromEntries(senders.map((s) => [s, round0(median(replySecs[s]))])),
      reply_mean_secs: Object.fromEntries(senders.map((s) => [s, round0(mean(replySecs[s]))])),
      immediate_pct: Object.fromEntries(senders.map((s) => {
        const v = replySecs[s];
        return [s, v.length ? round1(100 * v.filter((x) => x < IMMEDIATE_REPLY).length / v.length) : null];
      })),
      first_response_secs: Object.fromEntries(senders.map((s) => [s, round0(mean(firstSecs[s]))])),
      reply_count: Object.fromEntries(senders.map((s) => [s, replySecs[s].length])),
      talk_share: Object.fromEntries(senders.map((s) => [s, round1(100 * perSender[s].messages / messages.length)])),
    },
    champions: {
      first_texter: Object.fromEntries(senders.map((s) => [s, firstTexter[s]])),
      last_texter: Object.fromEntries(senders.map((s) => [s, lastTexter[s]])),
      peak_hour: peakHour,
      night_owl: nightOwl, // % of each sender's messages sent late at night (22:00–04:59)
    },
    milestones: { nth: milestonesNth },
    fun: {
      first_message: firstMessage, // { sender, text, when } or null — chat's opening line
      latest_night: latestNight,   // { sender, text, when } or null — latest 00:00–05:59 message
      top_emoji: mostCommon(topEmoji, 10),
      top_words: Object.fromEntries(senders.map((s) => [s, mostCommon(topWords[s], 10)])),
      // phrases used at least twice, top 8 per sender
      top_phrases: Object.fromEntries(senders.map((s) => [s, commonPhrases(topPhrases[s], topTrigrams[s], 8)])),
      longest_message: {
        sender: longest.sender,
        chars: cplen(longest.text),
        when: longest.when,
        preview: [...longest.text].slice(0, 200).join(""),
      },
      love_bomb: loveBomb, // { day, count } or null
      quarter_openers: [...quarterOpeners.values()],
      on_this_day: onThisDay, // { md, years:[{year,count,sample}] } or null — JS-only (today-relative)
      longest_convo: longestConvoOut, // { count, from, to, msgs } — the marathon session
      memories, // sampled older messages for the random-memory shuffle
    },
  };
  result.insights = buildInsights(result, laughsTotal);
  return result;
}
