// ==================================================================
// admin.js — عمليات الكتابة للمشرف (إضافة/تعديل/حذف/ترتيب/رفع ملفات)
// الصلاحية الفعلية تفرضها RLS — هذا الملف ما يتحقق من الدور بنفسه
// يُحمَّل بعد content.js
// ==================================================================

const ICONS_BUCKET = "activity-icons";

// -------------------------------------------------
// عمليات عامة على الجداول
// -------------------------------------------------
async function createRow(table, values) {
  const { data, error } = await supabaseClient.from(table).insert(values).select().single();
  if (error) throw error;
  return data;
}

async function updateRow(table, id, values) {
  const { error } = await supabaseClient.from(table).update(values).eq("id", id);
  if (error) throw error;
}

async function deleteRow(table, id) {
  const { error } = await supabaseClient.from(table).delete().eq("id", id);
  if (error) throw error;
}

// ترتيب الإضافة الجديدة = آخر القائمة
function nextSortOrder(rows) {
  return rows.length ? Math.max(...rows.map((r) => r.sort_order ?? 0)) + 1 : 0;
}

// تحريك عنصر خطوة فوق/تحت، ثم إعادة ترقيم القائمة كاملة (0،1،2...)
// نحدّث فقط الصفوف اللي تغيّر ترتيبها
async function moveRow(table, rows, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= rows.length) return rows;
  const list = rows.slice();
  [list[index], list[target]] = [list[target], list[index]];
  const changed = list
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => r.sort_order !== i);
  await Promise.all(changed.map(({ r, i }) => updateRow(table, r.id, { sort_order: i })));
  changed.forEach(({ r, i }) => (r.sort_order = i));
  return list;
}

// -------------------------------------------------
// التخزين
// -------------------------------------------------
function newFileName() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2)) + ".jpg";
}

// يستخرج المسار داخل الحافظة من الرابط العام
function storagePathFromUrl(url, bucket) {
  if (!url) return null;
  const marker = `/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

async function removeStorageFiles(bucket, paths) {
  const list = paths.filter(Boolean);
  for (let i = 0; i < list.length; i += 100) {
    const { error } = await supabaseClient.storage.from(bucket).remove(list.slice(i, i + 100));
    if (error) throw error;
  }
}

// أيقونة مجموعة/نشاط: تُصغّر لـ 256 وترجع رابط عام
async function uploadIcon(file, folder, bucket = ICONS_BUCKET) {
  const small = await compressImage(file, 256, 0.85);
  const path = `${folder}/${newFileName()}`;
  const { error } = await supabaseClient.storage.from(bucket).upload(path, small, { contentType: "image/jpeg" });
  if (error) throw error;
  return publicFileUrl(bucket, path);
}

async function removeIconByUrl(url, bucket = ICONS_BUCKET) {
  const path = storagePathFromUrl(url, bucket);
  if (path) {
    try { await removeStorageFiles(bucket, [path]); } catch (e) { /* ملف يتيم أهون من فشل العملية */ }
  }
}

// يجهّز قيم الأيقونة من نتيجة حقل الأيقونة بالنموذج، ويرفع الصورة لو لزم
// يرجع { icon_type, icon_value } ويحذف الصورة القديمة لو تغيّرت
async function resolveIconValues(formIcon, oldEntity, folder, bucket = ICONS_BUCKET) {
  const oldUploaded = oldEntity && oldEntity.icon_type === "upload" ? oldEntity.icon_value : null;

  if (formIcon.icon_type === "upload") {
    if (formIcon.icon_file) {
      const url = await uploadIcon(formIcon.icon_file, folder, bucket);
      if (oldUploaded) await removeIconByUrl(oldUploaded, bucket);
      return { icon_type: "upload", icon_value: url };
    }
    return { icon_type: "upload", icon_value: oldUploaded };
  }

  if (oldUploaded) await removeIconByUrl(oldUploaded, bucket);
  return { icon_type: "emoji", icon_value: (formIcon.icon_value || "").trim() || null };
}

// -------------------------------------------------
// صور البنود
// -------------------------------------------------
async function uploadItemImage(itemId, file, sortOrder) {
  const compressed = await compressImage(file, 1280, 0.75);
  const path = `${itemId}/${newFileName()}`;
  const { error: upErr } = await supabaseClient.storage
    .from(ITEM_IMAGES_BUCKET)
    .upload(path, compressed, { contentType: "image/jpeg" });
  if (upErr) throw upErr;
  try {
    return await createRow("item_images", { item_id: itemId, storage_path: path, sort_order: sortOrder });
  } catch (e) {
    // فشل الحفظ (مثلًا تجاوز حد 3 صور) = نحذف الملف المرفوع عشان ما يبقى يتيم
    await removeStorageFiles(ITEM_IMAGES_BUCKET, [path]).catch(() => {});
    throw e;
  }
}

async function deleteItemImage(image) {
  await removeStorageFiles(ITEM_IMAGES_BUCKET, [image.storage_path]);
  await deleteRow("item_images", image.id);
}

// -------------------------------------------------
// حذف متسلسل: الملفات أولًا ثم الصف (والقاعدة تحذف الأبناء تلقائيًا)
// -------------------------------------------------
async function deleteItemCompletely(itemId) {
  const { data, error } = await supabaseClient.from("item_images").select("storage_path").eq("item_id", itemId);
  if (error) throw error;
  await removeStorageFiles(ITEM_IMAGES_BUCKET, data.map((r) => r.storage_path));
  await deleteRow("items", itemId);
}

async function deleteRequirementCompletely(requirementId) {
  const { data, error } = await supabaseClient
    .from("items")
    .select("item_images(storage_path)")
    .eq("requirement_id", requirementId);
  if (error) throw error;
  await removeStorageFiles(ITEM_IMAGES_BUCKET, data.flatMap((it) => it.item_images.map((x) => x.storage_path)));
  await deleteRow("requirements", requirementId);
}

async function deleteActivityCompletely(activity) {
  const { data, error } = await supabaseClient
    .from("requirements")
    .select("items(item_images(storage_path))")
    .eq("activity_id", activity.id);
  if (error) throw error;
  const paths = data.flatMap((r) => r.items.flatMap((it) => it.item_images.map((x) => x.storage_path)));
  await removeStorageFiles(ITEM_IMAGES_BUCKET, paths);
  if (activity.icon_type === "upload") await removeIconByUrl(activity.icon_value);
  await deleteRow("activities", activity.id);
}

async function deleteGroupCompletely(group) {
  if (group.icon_type === "upload") await removeIconByUrl(group.icon_value);
  await deleteRow("activity_groups", group.id); // أنشطتها تبقى بدون مجموعة
}

// -------------------------------------------------
// الأدوات
// -------------------------------------------------
// رفع ملف أداة كما هو (بدون ضغط) مع الحفاظ على امتداده
async function uploadToolFile(file) {
  const ext = (file.name.match(/\.[a-z0-9]{1,8}$/i) || [""])[0].toLowerCase();
  const path = newFileName().replace(".jpg", ext);
  const { error } = await supabaseClient.storage
    .from(TOOL_FILES_BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (error) throw error;
  return publicFileUrl(TOOL_FILES_BUCKET, path);
}

async function deleteToolCompletely(tool) {
  if (toolKind(tool) === "file") {
    await removeStorageFiles(TOOL_FILES_BUCKET, [storagePathFromUrl(tool.url, TOOL_FILES_BUCKET)]);
  }
  if (tool.icon_type === "upload") await removeIconByUrl(tool.icon_value, TOOL_IMAGES_BUCKET);
  await deleteRow("tools", tool.id);
}

// -------------------------------------------------
// التوجيهات
// -------------------------------------------------
async function uploadDirectiveImage(file) {
  const compressed = await compressImage(file, 1280, 0.75);
  const path = newFileName();
  const { error } = await supabaseClient.storage
    .from(DIRECTIVE_IMAGES_BUCKET)
    .upload(path, compressed, { contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}

async function deleteDirectiveCompletely(d) {
  if (d.images && d.images.length) await removeStorageFiles(DIRECTIVE_IMAGES_BUCKET, d.images);
  await deleteRow("directives", d.id);
}

async function fetchDirectivesWithReads() {
  const { data, error } = await supabaseClient
    .from("directives")
    .select("id, title, content, images, created_at, directive_reads(count)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((d) => ({ ...d, reads: d.directive_reads?.[0]?.count ?? 0 }));
}

async function countActiveUsers() {
  const { count, error } = await supabaseClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_disabled", false);
  if (error) throw error;
  return count || 0;
}

// -------------------------------------------------
// المستخدمون (المالك فقط — الدوال بالقاعدة ترفض غيره)
// -------------------------------------------------
async function fetchAllProfiles() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, email, full_name, role, is_disabled, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

async function setUserRole(userId, role) {
  const { error } = await supabaseClient.rpc("set_user_role", { target: userId, new_role: role });
  if (error) throw error;
}

async function setUserDisabled(userId, disabled) {
  const { error } = await supabaseClient.rpc("set_user_disabled", { target: userId, disabled });
  if (error) throw error;
}

// رسالة خطأ مفهومة من أخطاء Supabase
function adminErrorMessage(e, fallback = "تعذر حفظ التغيير. تحقق من الاتصال وحاول مرة ثانية.") {
  const m = (e && e.message) || "";
  if (/3 صور/.test(m)) return "الحد الأقصى 3 صور للبند.";
  if (/duplicate key|tools_builtin_url_unique/i.test(m)) return "هذي الأداة مضافة من قبل.";
  if (/row-level security|permission|غير مصرّح/i.test(m)) return "ما عندك صلاحية لهذا الإجراء.";
  if (/لا يمكنك/.test(m)) return m;
  if (/fetch|network/i.test(m)) return "تعذر الاتصال. تحقق من الإنترنت وحاول مرة ثانية.";
  return fallback;
}
