// WhatsApp chat export parsing + zip reading for the browser (and Node for tests).
// Zero deps: the zip is read with a hand-written central-directory reader and the native
// DecompressionStream — no JSZip. Only the _chat.txt entry is extracted, never media.

const LRM = "‎"; // left-to-right mark; prefixes media/system lines and the edited marker
const EDITED = ` ${LRM}<This message was edited>`;

// [D.MM.YYYY, HH:MM:SS] Sender: text  (optional leading LRM; text may be empty).
// The comma between date and time is optional — older/other-locale exports omit it
// (e.g. "[3.04.2017 20:23:37]" vs "[4.09.2025, 20:45:45]").
const HEADER =
  /^‎?\[(\d{1,2})\.(\d{1,2})\.(\d{4}),? (\d{1,2}):(\d{2}):(\d{2})\] ([^:]+?):(?: (.*))?$/;

// LRM-stripped placeholder text -> normalized media type. Both English and Turkish exports
// (WhatsApp localizes the placeholder: "image omitted" ↔ "görüntü dahil edilmedi").
const MEDIA = {
  "image omitted": "image",
  "video omitted": "video",
  "audio omitted": "audio",
  "GIF omitted": "gif",
  "sticker omitted": "sticker",
  "document omitted": "document",
  "Contact card omitted": "contact",
  "görüntü dahil edilmedi": "image",
  "video dahil edilmedi": "video",
  "ses dahil edilmedi": "audio",
  "GIF dahil edilmedi": "gif",
  "Çıkartma dahil edilmedi": "sticker",
  "belge dahil edilmedi": "document",
  "Kişi kartı dahil edilmedi": "contact",
};

function finalize(msg) {
  let text = msg.lines.join("\n");
  const startedLRM = text.startsWith(LRM); // note before stripping; system notices are LRM-prefixed
  if (text.endsWith(EDITED)) {
    text = text.slice(0, -EDITED.length);
    msg.edited = true;
  }
  // A media placeholder is preceded by an LRM and may follow a caption/filename; detect the
  // `LRM + placeholder` suffix, tag the media type, keep any caption as the text.
  for (const [placeholder, kind] of Object.entries(MEDIA)) {
    if (text.endsWith(LRM + placeholder)) {
      msg.media = kind;
      text = text.slice(0, -(LRM.length + placeholder.length));
      break;
    }
  }
  msg.text = text.replaceAll(LRM, "").trim();
  // System notices (encryption note, "X added you") are LRM-prefixed and carry no media.
  msg.system = startedLRM && msg.media === null;
  delete msg.lines;
  return msg;
}

// Parse chat text into finalized message records, oldest first.
export function parse(text) {
  const messages = [];
  let current = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const m = HEADER.exec(line);
    if (m) {
      if (current) messages.push(finalize(current));
      const [, day, mon, year, hh, mm, ss, sender, body] = m;
      const when = new Date(+year, +mon - 1, +day, +hh, +mm, +ss);
      current = { when, sender: sender.trim(), text: "", media: null, edited: false, system: false, lines: [body ?? ""] };
    } else if (current) {
      current.lines.push(line); // continuation of a multi-line message
    }
  }
  if (current) messages.push(finalize(current));

  // Drop system-only senders: WhatsApp attributes group notices (encryption note, "X added you")
  // to a pseudo-sender named after the group. A sender whose EVERY message is a system notice is
  // not a real participant. Real participants keep all their messages (locations, deletions too).
  const bySender = {};
  for (const m of messages) (bySender[m.sender] ??= []).push(m);
  const systemSenders = new Set(
    Object.entries(bySender).filter(([, ms]) => ms.every((x) => x.system)).map(([s]) => s)
  );
  return systemSenders.size ? messages.filter((m) => !systemSenders.has(m.sender)) : messages;
}

// ── native zip reading ────────────────────────────────────────────────────────

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Extract the _chat.txt (or first .txt) string from a WhatsApp .zip via its central directory.
// ponytail: handles stored (0) + deflate (8) only, no zip64 — all a WhatsApp export ever uses.
export async function unzipChat(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (o) => view.getUint32(o, true);
  const u16 = (o) => view.getUint16(o, true);

  // End Of Central Directory (sig 0x06054b50), scanning back from the end (comment ≤ 64 KB).
  let eocd = -1;
  const minPos = Math.max(0, bytes.length - 22 - 65536);
  for (let i = bytes.length - 22; i >= minPos; i--) {
    if (u32(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip file");

  const count = u16(eocd + 10);
  let off = u32(eocd + 16); // central directory offset
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (u32(off) !== 0x02014b50) break;
    const method = u16(off + 10);
    const compSize = u32(off + 20);
    const nameLen = u16(off + 28);
    const extraLen = u16(off + 30);
    const commentLen = u16(off + 32);
    const localOff = u32(off + 42);
    const name = new TextDecoder().decode(bytes.subarray(off + 46, off + 46 + nameLen));
    entries.push({ name, method, compSize, localOff });
    off += 46 + nameLen + extraLen + commentLen;
  }

  const entry =
    entries.find((e) => e.name.endsWith("_chat.txt")) ??
    entries.find((e) => e.name.toLowerCase().endsWith(".txt"));
  if (!entry) throw new Error("no .txt chat file inside zip");

  // Local header (sig 0x04034b50): recompute data start from the LOCAL name/extra lengths,
  // which can differ from the central directory's.
  const lo = entry.localOff;
  if (u32(lo) !== 0x04034b50) throw new Error("bad local file header");
  const dataStart = lo + 30 + u16(lo + 26) + u16(lo + 28);
  const comp = bytes.subarray(dataStart, dataStart + entry.compSize);
  const raw = entry.method === 0 ? comp : await inflateRaw(comp);
  return new TextDecoder("utf-8").decode(raw);
}

// Read either a .zip (extract _chat.txt) or a raw _chat.txt, and parse it.
export async function readChat(bytes, isZip) {
  const text = isZip ? await unzipChat(bytes) : new TextDecoder("utf-8").decode(bytes);
  return parse(text);
}
