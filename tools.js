// ==================================================================
// tools.js — الأدوات: روابط خارجية، ملفات مرفوعة، أو أدوات جاهزة داخل التطبيق
// ==================================================================

const TOOL_FILES_BUCKET = "tool-files";
const TOOL_IMAGES_BUCKET = "tool-images";

// الأدوات الجاهزة: app://<key> ← صفحة داخل التطبيق
// تنضاف هنا كل أداة نبنيها، مثل: { "my-tool": "tool-my-tool.html" }
const BUILTIN_TOOLS = {};

async function fetchTools() {
  const { data, error } = await supabaseClient
    .from("tools")
    .select("id, name, url, icon_type, icon_value, is_hidden, sort_order, created_at");
  if (error) throw error;
  return data.sort(bySortOrder);
}

// نوع الأداة من رابطها: builtin | file | link
function toolKind(tool) {
  const url = tool.url || "";
  if (url.startsWith("app://")) return "builtin";
  if (url.includes(`/object/public/${TOOL_FILES_BUCKET}/`)) return "file";
  return "link";
}

function builtinPage(tool) {
  return BUILTIN_TOOLS[(tool.url || "").replace("app://", "")] || null;
}

function toolTileHtml(tool) {
  const kind = toolKind(tool);
  let href = tool.url;
  let attrs = 'target="_blank" rel="noopener"';
  if (kind === "builtin") {
    href = builtinPage(tool) || "#";
    attrs = builtinPage(tool) ? "" : 'data-unavailable="1"';
  }
  return `
    <a class="tile ${tool.is_hidden ? "is-hidden" : ""}" href="${escapeHtml(href)}" ${attrs}>
      <span class="tile-icon">${renderEntityIcon(tool, kind === "file" ? "file" : kind === "link" ? "link" : "tool")}</span>
      <span class="tile-name">${escapeHtml(tool.name)}</span>
      ${tool.is_hidden ? `<span class="chip chip-muted" style="align-self:flex-start">مخفية</span>` : ""}
    </a>`;
}
