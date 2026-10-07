// ==================================================================
// layout.js — الهيدر والشريط السفلي المشتركين لكل صفحات المفتش
// يُحمَّل بعد utils.js و directives.js
//
// بالصفحة:
//   <header id="appHeader"></header> ... <nav id="bottomNav"></nav>
//   renderShell("home")   // home | tools | directives | settings
// ==================================================================

const APP_NAME = "سند";
const APP_TAGLINE = "مرجع الاشتراطات للمفتش الميداني";

const NAV_TABS = [
  { key: "home", href: "index.html", label: "الرئيسية", icon: "home" },
  { key: "tools", href: "tools.html", label: "الأدوات", icon: "tool" },
  { key: "directives", href: "directives.html", label: "التوجيهات", icon: "megaphone" },
  { key: "settings", href: "settings.html", label: "الإعدادات", icon: "settings" },
];

function renderHeader() {
  const el = document.getElementById("appHeader");
  if (!el) return;
  el.className = "app-header";
  el.innerHTML = `
    <a class="app-header-inner" href="index.html">
      <span class="brand-mark">${svgIcon("book")}</span>
      <span>
        <div class="brand-name">${APP_NAME}</div>
        <div class="brand-tagline">${APP_TAGLINE}</div>
      </span>
    </a>`;
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

function renderShell(activeKey) {
  renderHeader();
  renderBottomNav(activeKey);
  updateDirectivesDot();
}
