// ==================================================================
// admin-ui.js — نافذة نموذج موحّدة لكل عمليات الإضافة والتعديل
//
// const saved = await formDialog({
//   title: "إضافة نشاط",
//   fields: [
//     { name: "name", label: "اسم النشاط", type: "text", required: true },
//     { name: "group_id", label: "المجموعة", type: "select", options: [{ value, label }] },
//     { name: "icon", label: "الأيقونة", type: "icon" },
//     { name: "content", label: "النص", type: "textarea" },
//     { name: "is_suspended", label: "موقوف", type: "checkbox" },
//   ],
//   values: { name: "..." },
//   submitText: "إضافة",
//   onSubmit: async (values) => { ... },   // لو رمى خطأ تبقى النافذة مفتوحة وتعرض الرسالة
// });
// ترجع true لو انحفظ، false لو أُلغي
// حقل icon يرجع: { icon_type, icon_value, icon_file }
// ==================================================================

function formDialog({ title, fields, values = {}, submitText = "حفظ", onSubmit }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const fieldHtml = (f, i) => {
      const id = `fd_${i}`;
      const v = values[f.name];
      switch (f.type) {
        case "textarea":
          return `<div class="field"><label for="${id}">${escapeHtml(f.label)}</label>
            <textarea id="${id}" name="${f.name}" rows="${f.rows || 4}" ${f.maxlength ? `maxlength="${f.maxlength}"` : ""}>${escapeHtml(v ?? "")}</textarea>
            ${f.hint ? `<div class="field-hint">${escapeHtml(f.hint)}</div>` : ""}</div>`;
        case "select":
          return `<div class="field"><label for="${id}">${escapeHtml(f.label)}</label>
            <select id="${id}" name="${f.name}">
              ${f.options.map((o) => `<option value="${escapeHtml(o.value)}" ${String(o.value) === String(v ?? "") ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
            </select></div>`;
        case "checkbox":
          return `<label class="check-row"><input type="checkbox" name="${f.name}" ${v ? "checked" : ""} /><span>${escapeHtml(f.label)}</span></label>
            ${f.hint ? `<div class="field-hint" style="margin:-10px 0 14px">${escapeHtml(f.hint)}</div>` : ""}`;
        case "icon": {
          const type = values.icon_type === "upload" ? "upload" : "emoji";
          const current = type === "upload" ? values.icon_value : "";
          return `<div class="field" data-icon-field>
            <label>${escapeHtml(f.label)}</label>
            <div class="seg">
              <label><input type="radio" name="icon_type" value="emoji" ${type === "emoji" ? "checked" : ""} />إيموجي</label>
              <label><input type="radio" name="icon_type" value="upload" ${type === "upload" ? "checked" : ""} />صورة</label>
            </div>
            <div data-emoji ${type === "upload" ? 'class="hidden"' : ""}>
              <input type="text" name="icon_emoji" value="${escapeHtml(type === "emoji" ? values.icon_value ?? "" : "")}" placeholder="مثل: 💈" maxlength="8" />
            </div>
            <div data-upload ${type === "emoji" ? 'class="hidden"' : ""}>
              <input type="file" name="icon_file" accept="image/*" />
              <img class="icon-preview ${current ? "" : "hidden"}" src="${escapeHtml(current || "")}" alt="" />
            </div>
          </div>`;
        }
        default:
          return `<div class="field"><label for="${id}">${escapeHtml(f.label)}</label>
            <input id="${id}" type="text" name="${f.name}" value="${escapeHtml(v ?? "")}" ${f.maxlength ? `maxlength="${f.maxlength}"` : ""} placeholder="${escapeHtml(f.placeholder || "")}" />
            ${f.hint ? `<div class="field-hint">${escapeHtml(f.hint)}</div>` : ""}</div>`;
      }
    };

    overlay.innerHTML = `
      <div class="modal-box" role="dialog" aria-modal="true">
        <h3>${escapeHtml(title)}</h3>
        <div style="margin-top:14px">${fields.map(fieldHtml).join("")}</div>
        <p class="msg error" data-msg></p>
        <div class="modal-actions">
          <button class="btn" data-ok>${escapeHtml(submitText)}</button>
          <button class="btn secondary" data-cancel>إلغاء</button>
        </div>
      </div>`;

    const box = overlay.querySelector(".modal-box");
    const msg = overlay.querySelector("[data-msg]");
    const ok = overlay.querySelector("[data-ok]");

    // تبديل الإيموجي/الصورة + معاينة الصورة المختارة
    const iconField = box.querySelector("[data-icon-field]");
    if (iconField) {
      iconField.querySelectorAll('input[name="icon_type"]').forEach((r) =>
        r.addEventListener("change", () => {
          const up = r.value === "upload" && r.checked;
          if (!r.checked) return;
          iconField.querySelector("[data-emoji]").classList.toggle("hidden", up);
          iconField.querySelector("[data-upload]").classList.toggle("hidden", !up);
        })
      );
      const fileInput = iconField.querySelector('input[name="icon_file"]');
      const preview = iconField.querySelector(".icon-preview");
      fileInput.addEventListener("change", () => {
        const f = fileInput.files[0];
        if (!f) return;
        preview.src = URL.createObjectURL(f);
        preview.classList.remove("hidden");
      });
    }

    function collect() {
      const out = {};
      for (const f of fields) {
        if (f.type === "checkbox") {
          out[f.name] = box.querySelector(`[name="${f.name}"]`).checked;
        } else if (f.type === "icon") {
          const type = box.querySelector('input[name="icon_type"]:checked').value;
          out[f.name] = {
            icon_type: type,
            icon_value: box.querySelector('input[name="icon_emoji"]').value,
            icon_file: box.querySelector('input[name="icon_file"]').files[0] || null,
          };
        } else {
          const raw = box.querySelector(`[name="${f.name}"]`).value;
          out[f.name] = f.type === "select" ? raw : raw.trim();
        }
      }
      return out;
    }

    function validate(v) {
      for (const f of fields) {
        if (f.required && f.type !== "checkbox" && f.type !== "icon" && !v[f.name]) return `اكتب ${f.label}.`;
        if (f.type === "icon" && v[f.name].icon_type === "upload" && !v[f.name].icon_file && values.icon_type !== "upload") {
          return "اختر صورة للأيقونة، أو بدّل إلى إيموجي.";
        }
      }
      return "";
    }

    const close = (result) => { overlay.remove(); resolve(result); };

    ok.addEventListener("click", async () => {
      const v = collect();
      const problem = validate(v);
      msg.textContent = problem;
      if (problem) return;
      ok.disabled = true;
      ok.textContent = "جارٍ الحفظ...";
      try {
        await onSubmit(v);
        close(true);
      } catch (e) {
        msg.textContent = adminErrorMessage(e);
        ok.disabled = false;
        ok.textContent = submitText;
      }
    });
    overlay.querySelector("[data-cancel]").addEventListener("click", () => close(false));
    overlay.addEventListener("click", (e) => { if (e.target === overlay && !ok.disabled) close(false); });

    document.body.appendChild(overlay);
    const first = box.querySelector("input[type=text], textarea");
    if (first) first.focus();
  });
}

// أزرار الترتيب والتعديل والحذف لصف إداري
function rowActionsHtml(index, total, { edit = true, remove = true } = {}) {
  return `<span class="row-actions">
    <button class="mini-btn" data-act="up" data-i="${index}" ${index === 0 ? "disabled" : ""} aria-label="نقل لأعلى">${svgIcon("up")}</button>
    <button class="mini-btn" data-act="down" data-i="${index}" ${index === total - 1 ? "disabled" : ""} aria-label="نقل لأسفل">${svgIcon("down")}</button>
    ${edit ? `<button class="mini-btn" data-act="edit" data-i="${index}" aria-label="تعديل">${svgIcon("edit")}</button>` : ""}
    ${remove ? `<button class="mini-btn danger" data-act="delete" data-i="${index}" aria-label="حذف">${svgIcon("trash")}</button>` : ""}
  </span>`;
}
