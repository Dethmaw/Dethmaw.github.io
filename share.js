// Sharing controls for the one-pager. Reads the computed stats off window.__stats (set by app.js).
// PNG is native (SVG <foreignObject> → canvas, zero deps); it falls back to Print if the browser
// taints the canvas (a known foreignObject limitation) — swap in html2canvas only if that bites.
import { reportHTML, fullDocument } from "./render.js";

const shareEl = document.getElementById("share");
let cssCache = null;
const css = async () => (cssCache ??= await (await fetch("styles.css")).text());
const stats = () => window.__stats;
const lang = () => window.__lang ?? "tr";
const baseName = (s) => `${s.core.senders.join("-").replace(/\s+/g, "_")}-whatsapp`;

function saveBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function toast(msg) {
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.cssText =
    "position:fixed;left:50%;bottom:76px;transform:translateX(-50%);background:#1e2b3a;" +
    "color:#e8eef4;padding:10px 16px;border-radius:20px;font-size:13px;z-index:9;box-shadow:0 4px 16px #0008";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// Rasterize the report to a PNG blob via html2canvas, using the WIDE multi-column layout so the
// shared image is wide and short (not the tall phone column). html2canvas paints the DOM directly
// (no SVG <foreignObject>), so the canvas is not tainted — the reason the previous native path
// fell back to Print in Chromium. Rendered off-screen at a fixed 1040px width.
async function reportPNG() {
  if (!window.html2canvas) throw new Error("html2canvas not loaded");
  const W = 1040;
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#0e1621";
  const fg = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim() || "#e8eef4";
  const holder = document.createElement("div");
  holder.id = "pngholder";
  holder.style.cssText = `position:fixed;left:-99999px;top:0;width:${W}px;background:${bg}`;
  // html2canvas ignores the native <details> collapsed state and would render every expandable
  // exchange (quarter openers / on-this-day / longest-silence) fully open — blowing up the image.
  // Scope a style to this off-screen node that hides the expandable bodies + disclosure markers,
  // so the PNG shows the collapsed summaries only (matching the on-screen collapsed look).
  const collapse = `<style>#pngholder details .qexpand{display:none!important}` +
    `#pngholder details>summary::before,#pngholder details>summary::after{display:none!important}</style>`;
  holder.innerHTML = `${collapse}<div class="report wide" style="max-width:${W}px;background:${bg};color:${fg};padding:16px">${reportHTML(stats(), lang())}</div>`;
  document.body.appendChild(holder);
  try {
    const canvas = await window.html2canvas(holder.querySelector(".report"), {
      backgroundColor: bg,
      scale: Math.min(2, window.devicePixelRatio || 1),
      width: W,
      windowWidth: W,
      useCORS: true,
      logging: false,
    });
    return await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("canvas.toBlob returned null"))), "image/png")
    );
  } finally {
    holder.remove();
  }
}

// Render a single report <section> to a theme-aware PNG blob (for single-card sharing). The section
// is cloned into an off-screen card; the disclosure markers, expandable bodies, and the injected
// share button are hidden so the card is clean.
export async function cardPNG(section) {
  if (!window.html2canvas) throw new Error("html2canvas not loaded");
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#0e1621";
  const fg = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim() || "#e8eef4";
  const W = 520;
  const holder = document.createElement("div");
  holder.id = "pngholder";
  holder.style.cssText = `position:fixed;left:-99999px;top:0;width:${W}px;background:${bg}`;
  const hide = `<style>#pngholder details .qexpand,#pngholder .cardshare{display:none!important}` +
    `#pngholder details>summary::before,#pngholder details>summary::after{display:none!important}</style>`;
  holder.innerHTML = `${hide}<div class="report" style="width:${W}px;background:${bg};color:${fg};padding:16px"></div>`;
  holder.querySelector(".report").appendChild(section.cloneNode(true));
  document.body.appendChild(holder);
  try {
    const canvas = await window.html2canvas(holder.querySelector(".report"), {
      backgroundColor: bg, scale: Math.min(2, window.devicePixelRatio || 1), width: W, windowWidth: W, useCORS: true, logging: false,
    });
    return await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("null blob"))), "image/png"));
  } finally { holder.remove(); }
}

// Share (or copy/download) one section as an image — used by the per-card share buttons. Each step
// is guarded independently and falls through to a plain download, so the button ALWAYS does
// something (the previous version swallowed a clipboard/share failure and appeared to do nothing).
export async function shareCard(section) {
  const name = `${baseName(stats())}-card.png`;
  let blob;
  try {
    blob = await cardPNG(section);
  } catch (e) {
    console.error("card render failed:", e);
    toast("Kart oluşturulamadı");
    return;
  }
  const file = new File([blob], name, { type: "image/png" });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return; }
  } catch (e) {
    if (e?.name === "AbortError") return; // user dismissed the share sheet
  }
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("Kart panoya kopyalandı");
      return;
    }
  } catch (e) {
    console.warn("clipboard failed, downloading instead:", e);
  }
  saveBlob(name, blob); // always-works fallback
  toast("Kart indirildi");
}

async function downloadHTML() {
  // wide=true: the downloaded document uses the multi-column layout (responsive: 1 column on a
  // phone, up to 3 on a wide screen), matching the wider/shorter shared image.
  saveBlob(`${baseName(stats())}.html`, new Blob([fullDocument(stats(), await css(), true, lang())], { type: "text/html" }));
}

async function copyPNG() {
  try {
    const blob = await reportPNG();
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("Görsel panoya kopyalandı");
    } else {
      saveBlob(`${baseName(stats())}.png`, blob);
    }
  } catch (e) {
    console.error("PNG export failed, falling back to print:", e);
    window.print();
  }
}

async function shareNative() {
  const s = stats();
  try {
    const file = new File([await reportPNG()], `${baseName(s)}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "WhatsApp Sohbet İstatistikleri" });
      return;
    }
  } catch (e) {
    if (e?.name === "AbortError") return; // user dismissed the share sheet
    console.error("file share failed, falling back to text:", e);
  }
  if (navigator.share) {
    await navigator.share({
      title: "WhatsApp Sohbet İstatistikleri",
      text: `${s.core.senders.join(" & ")} — ${s.core.total.toLocaleString("en-US")} mesaj`,
    }).catch(() => {});
  }
}

function button(label, fn) {
  const b = document.createElement("button");
  b.textContent = label;
  b.addEventListener("click", fn);
  return b;
}

shareEl.append(
  button("⬇ İndir (HTML)", downloadHTML),
  button("🖼 Görsel (PNG)", copyPNG),
  button("🖨 PDF", () => window.print())
);
// Web Share only where the browser can actually share files (mobile Safari/Chrome), else hide it.
const canShareFiles =
  navigator.canShare?.({ files: [new File([""], "x.png", { type: "image/png" })] }) ?? false;
if (canShareFiles) shareEl.prepend(button("📤 Paylaş", shareNative));
