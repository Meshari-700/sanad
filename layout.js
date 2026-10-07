// ==================================================================
// layout.js — الهيدر والشريط السفلي المشتركين لكل صفحات المفتش
// يُحمَّل بعد utils.js و directives.js
//
// بالصفحة:
//   <header id="appHeader"></header> ... <nav id="bottomNav"></nav>
//   renderShell("home")   // home | tools | directives | settings
// ==================================================================

const APP_NAME = "سند";
const APP_TAGLINE = "مرجعك الموثوق في أعمال التفتيش";

const NAV_TABS = [
  { key: "home", href: "index.html", label: "الرئيسية", icon: "home" },
  { key: "tools", href: "tools.html", label: "الأدوات", icon: "tool" },
  { key: "directives", href: "directives.html", label: "التوجيهات", icon: "megaphone" },
  { key: "settings", href: "settings.html", label: "الإعدادات", icon: "settings" },
];

function renderHeader({ sync = false } = {}) {
  const el = document.getElementById("appHeader");
  if (!el) return;
  el.className = "app-header";
  el.innerHTML = `
    <div class="app-header-inner">
      <a class="brand-link" href="index.html">
        <img class="brand-logo" src="mark-white.png" alt="" />
        <span>
          <div class="brand-name">${APP_NAME}</div>
          <div class="brand-tagline">${APP_TAGLINE}</div>
        </span>
      </a>
      ${sync ? `<button class="sync-btn" id="syncBtn" aria-label="مزامنة">${svgIcon("sync")}</button>` : ""}
    </div>`;
  if (sync) document.getElementById("syncBtn").addEventListener("click", syncApp);
}

// المزامنة: تجيب أحدث نسخة من ملفات التطبيق والبيانات
// (التطبيق المضاف للشاشة الرئيسية بالآيفون ما فيه سحب للتحديث)
async function syncApp() {
  const btn = document.getElementById("syncBtn");
  if (btn) { btn.disabled = true; btn.classList.add("is-spinning"); }
  sessionStorage.removeItem(PROFILE_CACHE_KEY); // الدور أو الاسم ممكن تغيّر
  const urls = [
    ...Array.from(document.scripts).map((s) => s.src),
    ...Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((l) => l.href),
  ].filter((u) => u && u.startsWith(location.origin));
  try {
    await Promise.all(urls.map((u) => fetch(u, { cache: "reload" }).catch(() => {})));
  } catch (e) { /* نكمل التحديث بأي حال */ }
  location.replace(location.pathname + "?v=" + Date.now());
}

function renderBottomNav(activeKey) {
  const el = document.getElementById("bottomNav");
  if (!el) return;
  el.className = "bottom-nav";
  el.setAttribute("aria-label", "التنقل الرئيسي");
  el.innerHTML = `<div class="bottom-nav-inner" style="grid-template-columns:repeat(${NAV_TABS.length},1fr)">${NAV_TABS.map(
    (t) => `
      <a href="${t.href}" class="nav-link ${t.key === activeKey ? "active" : ""}" data-tab="${t.key}" ${t.key === activeKey ? 'aria-current="page"' : ""}>
        <span class="nav-icon">${svgIcon(t.icon)}</span>${t.label}
      </a>`
  ).join("")}</div>`;
}

// نقطة حمراء فوق "التوجيهات" لو فيه توجيه غير مقروء
async function updateDirectivesDot() {
  try {
    const unread = await countUnreadDirectives();
    const icon = document.querySelector('.nav-link[data-tab="directives"] .nav-icon');
    if (!icon) return;
    let dot = icon.querySelector(".nav-dot");
    if (unread > 0 && !dot) {
      dot = document.createElement("span");
      dot.className = "nav-dot";
      dot.setAttribute("aria-label", "توجيهات جديدة");
      icon.appendChild(dot);
    } else if (unread === 0 && dot) {
      dot.remove();
    }
  } catch (e) { /* فشل التحقق ما يوقف الصفحة */ }
}

function renderShell(activeKey, headerOptions = {}) {
  renderHeader(headerOptions);
  renderBottomNav(activeKey);
  updateDirectivesDot();
}
