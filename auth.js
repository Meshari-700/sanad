// ==================================================================
// auth.js — الدخول والخروج والتحقق من الصلاحية
// يُحمَّل بعد config.js وقبل أي سكربت يستخدم دواله (الترتيب حرج)
// ==================================================================

const PROFILE_CACHE_KEY = "sanad_profile_cache";

// تنقية أي نص قبل إدراجه عبر innerHTML (حماية من حقن الكود)
function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

async function login(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// الاسم يُرسل مع التسجيل نفسه، والقاعدة تحفظه بـ profiles عبر المُشغّل
async function signup(email, password, fullName) {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) throw error;
  return data;
}

// رابط الاستعادة يرجع لصفحة تعيين كلمة المرور
async function requestPasswordReset(email) {
  const redirectTo = new URL("reset-password.html", window.location.href).href;
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

// احتياط: لو رابط الاستعادة فتح أي صفحة ثانية، نوجهه لصفحة تعيين كلمة المرور
if (typeof supabaseClient !== "undefined" && supabaseClient.auth && supabaseClient.auth.onAuthStateChange) {
  supabaseClient.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY" && !/reset-password\.html$/.test(window.location.pathname)) {
      window.location.replace("reset-password.html");
    }
  });
}

async function logout() {
  sessionStorage.removeItem(PROFILE_CACHE_KEY);
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
}

// بيانات المستخدم الحالي، مع نسخة مؤقتة بالجلسة توفّر طلبًا بكل صفحة
async function getCurrentProfile() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return null;

  const cached = sessionStorage.getItem(PROFILE_CACHE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed.id === session.user.id) return parsed;
    } catch (e) { /* نسخة تالفة: نتجاهلها ونجيبها من الخادم */ }
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, email, role, is_disabled, full_name")
    .eq("id", session.user.id)
    .single();
  if (error) return null;

  sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data));
  return data;
}

function isAdminRole(profile) {
  return !!profile && (profile.role === "admin" || profile.role === "owner");
}

function roleLabel(role) {
  return { owner: "مالك النظام", admin: "مشرف", viewer: "مفتش" }[role] || "مفتش";
}

function showDisabledAccountScreen() {
  document.body.innerHTML = `
    <div class="blocked-screen">
      <div>
        <h2>تم تعطيل حسابك</h2>
        <p>لا يمكنك استخدام سند حاليًا. تواصل مع مالك النظام لإعادة التفعيل.</p>
        <button id="blockedLogoutBtn" class="btn secondary">تسجيل الخروج</button>
      </div>
    </div>`;
  document.getElementById("blockedLogoutBtn").addEventListener("click", logout);
}

// تعديل الاسم عبر الدالة المخصصة فقط (ما نعدّل profiles مباشرة)
async function setMyName(name) {
  const { error } = await supabaseClient.rpc("set_my_name", { p_name: name });
  if (error) throw error;
  const cached = sessionStorage.getItem(PROFILE_CACHE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      parsed.full_name = name.trim() || null;
      sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(parsed));
    } catch (e) { /* تُجلب صحيحة بالمرة الجاية */ }
  }
}

// حارس الصفحات:
//   const profile = await requireAuth();                    // أي مستخدم مسجّل
//   const profile = await requireAuth({ adminOnly: true }); // مشرف/مالك
//   const profile = await requireAuth({ ownerOnly: true }); // مالك فقط
async function requireAuth(options = {}) {
  const profile = await getCurrentProfile();

  if (!profile) {
    window.location.href = "login.html";
    return null;
  }
  if (profile.is_disabled) {
    showDisabledAccountScreen();
    return null;
  }
  if (options.ownerOnly && profile.role !== "owner") {
    window.location.href = "index.html";
    return null;
  }
  if (options.adminOnly && !isAdminRole(profile)) {
    window.location.href = "index.html";
    return null;
  }
  return profile;
}
