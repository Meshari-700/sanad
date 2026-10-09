// ==================================================================
// reports.js — محرك المحاضر: رسم القالب، إنتاج PDF، لوحة التوقيع، الحفظ والجلب
// يحتاج: report-templates.js، ومكتبة jsPDF عند إنتاج الـ PDF
// ==================================================================

const REPORTS_BUCKET = "reports";
const RENDER_SCALE = 2;              // دقة الرسم: 2 بكسل لكل نقطة PDF (≈144 DPI)
const INK = "#0d2a6e";               // لون "حبر" التعبئة
const REPORT_FONT = '"IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif';

// -------------------------------------------------
// تحميل الصور والخط قبل الرسم
// -------------------------------------------------
const _imgCache = {};
function loadImage(src) {
  if (!_imgCache[src]) {
    _imgCache[src] = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("تعذر تحميل صورة القالب"));
      img.src = src;
    });
  }
  return _imgCache[src];
}

// صورة القالب: نجرب الاسم المحدد ثم البدائل الشائعة
// (الآيفون أحيانًا يرفعها بامتداد jpeg بدل jpg، أو بدون بادئة template-)
async function loadTemplateImage(src) {
  const base = src.replace(/\.(jpe?g)$/i, "");
  const plain = base.replace(/^template-/, "");
  const candidates = [...new Set([
    src, `${base}.jpeg`, `${base}.jpg`, `${base}.JPG`, `${base}.JPEG`,
    `${plain}.jpg`, `${plain}.jpeg`, `templates/${plain}.jpg`,
  ])];
  for (const c of candidates) {
    try { return await loadImage(c); } catch (e) { delete _imgCache[c]; }
  }
  throw new Error("تعذر تحميل صورة القالب");
}

async function ensureReportFont() {
  try {
    await Promise.all([
      document.fonts.load(`500 20px ${REPORT_FONT}`, "سند"),
      document.fonts.load(`700 20px ${REPORT_FONT}`, "سند"),
    ]);
  } catch (e) { /* لو فشل الخط يُستخدم البديل */ }
}

// -------------------------------------------------
// أدوات الرسم على صفحة واحدة (الإحداثيات بنقاط PDF)
// -------------------------------------------------
function makePainter(ctx) {
  const S = RENDER_SCALE;

  function setFont(size, weight = 500) {
    ctx.font = `${weight} ${size * S}px ${REPORT_FONT}`;
  }

  // يصغّر الخط لين يدخل النص بالعرض المتاح
  function fit(str, size, maxWidth, weight) {
    let s = size;
    setFont(s, weight);
    while (maxWidth && ctx.measureText(str).width > maxWidth * S && s > 6) {
      s -= 0.5;
      setFont(s, weight);
    }
    return s;
  }

  return {
    text(value, xRight, baseline, { size = 10, maxWidth = null, weight = 500, color = INK, align = "right" } = {}) {
      if (value === null || value === undefined || value === "") return;
      const str = String(value);
      fit(str, size, maxWidth, weight);
      ctx.fillStyle = color;
      ctx.direction = "rtl";
      ctx.textAlign = align;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(str, xRight * S, baseline * S);
    },

    // نص بمنتصف خانة
    center(value, x0, x1, top, bottom, { size = 10, weight = 500, color = INK } = {}) {
      if (value === null || value === undefined || value === "") return;
      const str = String(value);
      const s = fit(str, size, x1 - x0 - 4, weight);
      ctx.fillStyle = color;
      ctx.direction = "rtl";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(str, ((x0 + x1) / 2) * S, ((top + bottom) / 2 + s * 0.38) * S);
    },

    // نص طويل يتوزع على أسطر منقطة (يقطع على الكلمات)
    wrap(value, xRight, maxWidth, baselines, { size = 10.5, weight = 500, color = INK } = {}) {
      if (!value) return;
      setFont(size, weight);
      ctx.fillStyle = color;
      ctx.direction = "rtl";
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      const lines = [];
      for (const para of String(value).split(/\n/)) {
        let line = "";
        for (const word of para.split(/\s+/).filter(Boolean)) {
          const test = line ? line + " " + word : word;
          if (ctx.measureText(test).width > maxWidth * S && line) {
            lines.push(line);
            line = word;
          } else {
            line = test;
          }
        }
        lines.push(line);
      }
      lines.slice(0, baselines.length).forEach((ln, i) => ctx.fillText(ln, xRight * S, baselines[i] * S));
    },

    // علامة ✓ فوق دائرة/مربع الاختيار
    check(cx, cy, scale = 1) {
      const k = 5 * scale * S;
      ctx.save();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.8 * S;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(cx * S - k * 0.9, cy * S - k * 0.05);
      ctx.lineTo(cx * S - k * 0.25, cy * S + k * 0.65);
      ctx.lineTo(cx * S + k * 1.0, cy * S - k * 0.9);
      ctx.stroke();
      ctx.restore();
    },

    // تغطية نص مطبوع مسبقًا (مثل "/ / 144هـ")
    white(x0, y0, x1, y1) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x0 * S, y0 * S, (x1 - x0) * S, (y1 - y0) * S);
    },

    // صورة توقيع داخل مربع مع الحفاظ على النسبة
    sign(img, x0, y0, x1, y1) {
      if (!img) return;
      const bw = (x1 - x0) * S;
      const bh = (y1 - y0) * S;
      const r = Math.min(bw / img.width, bh / img.height);
      const w = img.width * r;
      const h = img.height * r;
      ctx.drawImage(img, x0 * S + (bw - w) / 2, y0 * S + (bh - h) / 2, w, h);
    },
  };
}

// يرسم كل صفحات المحضر ويرجع مصفوفة canvas
// signatures: { key: dataURL }
async function renderReportPages(tpl, data, signatures) {
  await ensureReportFont();
  const bg = await loadTemplateImage(tpl.image);
  const sigImgs = {};
  for (const [k, url] of Object.entries(signatures || {})) {
    if (url) sigImgs[k] = await loadImage(url);
  }

  const pages = [];
  const count = tpl.pageCount(data);
  for (let p = 0; p < count; p++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(PAGE_W * RENDER_SCALE);
    canvas.height = Math.round(PAGE_H * RENDER_SCALE);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    tpl.render(makePainter(ctx), data, sigImgs, p);
    pages.push(canvas);
  }
  return pages;
}

function pagesToPdfBlob(pages) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  pages.forEach((canvas, i) => {
    if (i > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.85), "JPEG", 0, 0, PAGE_W, PAGE_H, undefined, "FAST");
  });
  return pdf.output("blob");
}

// -------------------------------------------------
// لوحة التوقيع بالإصبع
// -------------------------------------------------
function createSignaturePad(canvas, onChange) {
  const ctx = canvas.getContext("2d");
  let drawing = false;
  let empty = true;
  let last = null;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const snapshot = empty ? null : canvas.toDataURL();
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    if (snapshot) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = snapshot;
    }
  }

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (!canvas.width) resize();
    canvas.setPointerCapture(e.pointerId);
    drawing = true;
    last = pos(e);
    ctx.beginPath();
    ctx.arc(last.x, last.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    if (empty) { empty = false; onChange && onChange(false); }
  });
  const end = () => { drawing = false; };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  resize();
  window.addEventListener("resize", resize);

  return {
    refresh: resize,
    isEmpty: () => empty,
    clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      empty = true;
      onChange && onChange(true);
    },
    // صورة شفافة مقصوصة على حدود التوقيع
    toDataURL() {
      if (empty) return null;
      const w = canvas.width, h = canvas.height;
      const px = ctx.getImageData(0, 0, w, h).data;
      let minX = w, minY = h, maxX = 0, maxY = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (px[(y * w + x) * 4 + 3] > 10) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX <= minX || maxY <= minY) return null;
      const pad = 6;
      const out = document.createElement("canvas");
      out.width = maxX - minX + pad * 2;
      out.height = maxY - minY + pad * 2;
      out.getContext("2d").drawImage(canvas, minX - pad, minY - pad, out.width, out.height, 0, 0, out.width, out.height);
      return out.toDataURL("image/png");
    },
  };
}

// -------------------------------------------------
// الحفظ والجلب
// -------------------------------------------------
function newReportId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// يرفع الـ PDF أولًا ثم يحفظ السجل (لو فشل الرفع ما يتسجل محضر بدون ملف)
async function saveReport({ tpl, data, pdfBlob }) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) throw new Error("not signed in");
  const id = newReportId();
  const path = `${user.id}/${id}.pdf`;

  const { error: upErr } = await supabaseClient.storage
    .from(REPORTS_BUCKET)
    .upload(path, pdfBlob, { contentType: "application/pdf" });
  if (upErr) throw upErr;

  const { error } = await supabaseClient.from("reports").insert({
    id,
    template_key: tpl.key,
    shop_name: data[tpl.shopKey] || null,
    data,
    pdf_path: path,
  });
  if (error) throw error;
  return { id, path };
}

async function fetchReports() {
  const { data, error } = await supabaseClient
    .from("reports")
    .select("id, template_key, shop_name, pdf_path, created_at, created_by, author:profiles(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return data;
}

async function reportSignedUrl(path) {
  const { data, error } = await supabaseClient.storage.from(REPORTS_BUCKET).createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}

async function deleteReport(report) {
  const { error: sErr } = await supabaseClient.storage.from(REPORTS_BUCKET).remove([report.pdf_path]);
  if (sErr) throw sErr;
  const { error } = await supabaseClient.from("reports").delete().eq("id", report.id);
  if (error) throw error;
}

function reportFileName(tpl, data) {
  const shop = (data && data[tpl.shopKey]) ? " - " + String(data[tpl.shopKey]).replace(/[\\/:*?"<>|]/g, "").slice(0, 40) : "";
  return `${tpl.title}${shop}.pdf`;
}

// مشاركة ملف (واتساب، بريد...) أو تنزيله لو المتصفح ما يدعم المشاركة
async function shareOrDownload(blob, fileName) {
  const file = new File([blob], fileName, { type: "application/pdf" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] }); // بدون title: الآيفون يحفظ العنوان كملف نصي إضافي
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return; // المستخدم ألغى
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
