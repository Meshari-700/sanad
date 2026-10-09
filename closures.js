// ==================================================================
// closures.js — أداة "إجراء إغلاق منشأة": الحفظ، الجلب، التصدير لإكسل
// ==================================================================

const CLOSURE_PHOTOS_BUCKET = "closure-photos";

const VISIT_REASONS = {
  citizen_report: "بلاغ مواطن",
  transaction: "معاملة",
  periodic: "زيارة دورية",
  followup: "زيارة متابعة",
  other: "أخرى",
};

const CLOSURE_REASONS = {
  no_license: "لا يوجد ترخيص",
  license_suspended: "الرخصة موقوفة",
  license_cancelled: "الرخصة ملغية",
};

function visitReasonText(c) {
  if (c.visit_reason === "other") return c.visit_reason_other ? `أخرى: ${c.visit_reason_other}` : "أخرى";
  return VISIT_REASONS[c.visit_reason] || "";
}

function newUuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function pad2(n) { return String(n).padStart(2, "0"); }

function formatDateTime(value) {
  const d = new Date(value);
  if (isNaN(d)) return "";
  let h = d.getHours();
  const period = h < 12 ? "ص" : "م";
  h = h % 12 || 12;
  return `${formatDate(d)} ${h}:${pad2(d.getMinutes())} ${period}`;
}

// -------------------------------------------------
// الموقع: رابط قوقل ماب من GPS، أو رابط يلصقه المفتش
// -------------------------------------------------
function mapsLink(lat, lng) {
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
}

// يقبل روابط قوقل ماب بأشكالها (maps.google.com، google.com/maps، maps.app.goo.gl، goo.gl/maps)
function isMapsLink(url) {
  return /^https?:\/\/((www\.|maps\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(url || "");
}

// يحاول يطلع الإحداثيات من الرابط (الروابط المختصرة ما فيها إحداثيات)
function coordsFromLink(url) {
  const m = (url || "").match(/(?:[?&](?:q|query|ll)=|@)(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}

// يطلع الرابط من نص ملصوق (قوقل ماب أحيانًا يضيف اسم المكان قبل الرابط)
function extractUrl(text) {
  const m = (text || "").match(/https?:\/\/\S+/);
  return m ? m[0] : (text || "").trim();
}

// -------------------------------------------------
// الحفظ: الصورة أولًا، ولو فشل حفظ السجل تنحذف الصورة
// -------------------------------------------------
async function saveClosure(values, photoFile) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) throw new Error("not signed in");
  const id = newUuid();
  const path = `${user.id}/${id}.jpg`;

  const photo = await compressImage(photoFile, 1280, 0.75);
  const { error: upErr } = await supabaseClient.storage
    .from(CLOSURE_PHOTOS_BUCKET)
    .upload(path, photo, { contentType: "image/jpeg" });
  if (upErr) throw upErr;

  const coords = coordsFromLink(values.location_url);
  const { error } = await supabaseClient.from("closures").insert({
    id,
    ...values,
    lat: coords ? coords.lat : null,
    lng: coords ? coords.lng : null,
    photo_path: path,
  });
  if (error) {
    await supabaseClient.storage.from(CLOSURE_PHOTOS_BUCKET).remove([path]).catch(() => {});
    throw error;
  }
  return id;
}

// filters: { userId, from: "YYYY-MM-DD", to: "YYYY-MM-DD" }
async function fetchClosures({ userId = null, from = null, to = null } = {}) {
  let q = supabaseClient
    .from("closures")
    .select("id, visit_number, license_number, visit_reason, visit_reason_other, closure_reason, location_url, lat, lng, photo_path, created_at, created_by, author:profiles(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (userId) q = q.eq("created_by", userId);
  if (from) q = q.gte("created_at", new Date(from + "T00:00:00").toISOString());
  if (to) {
    const end = new Date(to + "T00:00:00");
    end.setDate(end.getDate() + 1);
    q = q.lt("created_at", end.toISOString());
  }
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

async function closurePhotoUrl(path) {
  const { data, error } = await supabaseClient.storage.from(CLOSURE_PHOTOS_BUCKET).createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}

async function closurePhotoUrls(paths) {
  if (!paths.length) return {};
  const out = {};
  for (let i = 0; i < paths.length; i += 100) {
    const { data, error } = await supabaseClient.storage
      .from(CLOSURE_PHOTOS_BUCKET)
      .createSignedUrls(paths.slice(i, i + 100), 900);
    if (error) throw error;
    data.forEach((d) => { if (d.signedUrl) out[d.path] = d.signedUrl; });
  }
  return out;
}

async function deleteClosure(c) {
  const { error: sErr } = await supabaseClient.storage.from(CLOSURE_PHOTOS_BUCKET).remove([c.photo_path]);
  if (sErr) throw sErr;
  const { error } = await supabaseClient.from("closures").delete().eq("id", c.id);
  if (error) throw error;
}

// -------------------------------------------------
// التصدير لإكسل (يحتاج xlsx-lite.js) — الصور مصغّرة ومدمجة بخلايا عمود الصورة
// -------------------------------------------------
// يجيب الصورة ويصغّرها (أقصى بُعد 360) ويرجعها كبايتات JPEG
async function thumbnailBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("photo");
  const blob = await res.blob();
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    const u = URL.createObjectURL(blob);
    i.onload = () => { URL.revokeObjectURL(u); resolve(i); };
    i.onerror = () => { URL.revokeObjectURL(u); reject(new Error("decode")); };
    i.src = u;
  });
  const k = Math.min(1, 360 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const out = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.7));
  return { data: new Uint8Array(await out.arrayBuffer()), w: c.width, h: c.height };
}

async function exportClosuresXlsx(rows, onProgress = () => {}) {
  const PHOTO_COL = 9;   // العمود العاشر (صفري)
  const ROW_H = 96;      // نقطة ≈ 128 بكسل
  const BOX_W = 150, BOX_H = 120; // مساحة الصورة داخل الخلية بالبكسل

  const urls = await closurePhotoUrls(rows.map((r) => r.photo_path));
  const thumbs = new Array(rows.length);
  let done = 0;
  // 4 صور بالتوازي
  const queue = rows.map((r, i) => i);
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, async () => {
    while (queue.length) {
      const i = queue.shift();
      const url = urls[rows[i].photo_path];
      try { if (url) thumbs[i] = await thumbnailBytes(url); } catch (e) { thumbs[i] = null; }
      onProgress(++done, rows.length);
    }
  }));

  const sheetRows = rows.map((r, i) => {
    const d = new Date(r.created_at);
    const h = d.getHours();
    const t = thumbs[i];
    let image = null;
    if (t) {
      const k = Math.min(BOX_W / t.w, BOX_H / t.h);
      const w = Math.round(t.w * k), hh = Math.round(t.h * k);
      image = { col: PHOTO_COL, data: t.data, w, h: hh, offX: 4, offY: Math.max(2, Math.round((128 - hh) / 2)) };
    }
    return {
      cells: [
        i + 1,
        r.visit_number,
        formatDate(d),
        `${h % 12 || 12}:${pad2(d.getMinutes())} ${h < 12 ? "ص" : "م"}`,
        (r.author && (r.author.full_name || r.author.email)) || "",
        r.license_number || "",
        visitReasonText(r),
        CLOSURE_REASONS[r.closure_reason] || "",
        r.location_url ? { text: "فتح الموقع", link: r.location_url } : "",
        t ? "" : "تعذر تحميل الصورة",
      ],
      image,
    };
  });

  return buildXlsx({
    sheetName: "إجراءات الإغلاق",
    rowHeight: ROW_H,
    columns: [
      { header: "م", width: 6 },
      { header: "رقم الزيارة", width: 16 },
      { header: "التاريخ", width: 13 },
      { header: "الوقت", width: 11 },
      { header: "المفتش", width: 24 },
      { header: "رقم الرخصة", width: 15 },
      { header: "سبب الزيارة", width: 24 },
      { header: "سبب الإغلاق", width: 18 },
      { header: "الموقع", width: 14 },
      { header: "صورة الواجهة", width: 22.5 },
    ],
    rows: sheetRows,
  });
}

// مشاركة أو تنزيل أي ملف
async function shareOrDownloadFile(blob, fileName) {
  const file = new File([blob], fileName, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] }); // بدون title: الآيفون يحفظ العنوان كملف نصي إضافي
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
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
