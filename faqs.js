// ==================================================================
// faqs.js — الأسئلة الشائعة بالرئيسية (منسدلة)
// المشرف يضيف ويعدّل ويحذف ويرتّب من نفس القسم (يحتاج admin.js و admin-ui.js)
// ==================================================================

async function fetchFaqs() {
  const { data, error } = await supabaseClient
    .from("faqs")
    .select("id, question, answer, sort_order, created_at");
  if (error) throw error;
  return data.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.created_at).localeCompare(String(b.created_at)));
}

function initFaqs(box, addBtn, isAdmin) {
  let faqs = [];
  const open = new Set();

  function render() {
    if (!faqs.length) {
      box.innerHTML = `<div class="empty"><strong>لا توجد أسئلة</strong></div>`;
      return;
    }
    box.innerHTML = `<div class="faq-list">${faqs.map((f, i) => {
      const isOpen = open.has(f.id);
      return `
        <div class="faq ${isOpen ? "is-open" : ""}" data-id="${f.id}">
          <button class="faq-toggle" data-toggle aria-expanded="${isOpen}">
            <span class="faq-q">${escapeHtml(f.question)}</span>
            ${svgIcon("caretDown", "icon-sm faq-caret")}
          </button>
          ${isAdmin ? `<div class="faq-tools">${rowActionsHtml(i, faqs.length)}</div>` : ""}
          <div class="faq-a">${escapeHtml(f.answer)}</div>
        </div>`;
    }).join("")}</div>`;
  }

  function faqForm(f) {
    return formDialog({
      title: f ? "تعديل السؤال" : "إضافة سؤال",
      submitText: f ? "حفظ التعديل" : "إضافة",
      values: f ? { question: f.question, answer: f.answer } : {},
      fields: [
        { name: "question", label: "السؤال", type: "text", required: true, maxlength: 300 },
        { name: "answer", label: "الجواب", type: "textarea", required: true, rows: 6, maxlength: 4000 },
      ],
      onSubmit: async (v) => {
        if (f) {
          await updateRow("faqs", f.id, { question: v.question, answer: v.answer });
          Object.assign(f, { question: v.question, answer: v.answer });
        } else {
          faqs.push(await createRow("faqs", { question: v.question, answer: v.answer, sort_order: nextSortOrder(faqs) }));
        }
      },
    });
  }

  box.addEventListener("click", async (e) => {
    const card = e.target.closest(".faq");
    if (!card) return;
    if (e.target.closest("[data-toggle]")) {
      open.has(card.dataset.id) ? open.delete(card.dataset.id) : open.add(card.dataset.id);
      card.classList.toggle("is-open");
      card.querySelector("[data-toggle]").setAttribute("aria-expanded", String(open.has(card.dataset.id)));
      return;
    }
    const btn = e.target.closest("button[data-act]");
    if (!btn || !isAdmin) return;
    const i = Number(btn.dataset.i);
    const act = btn.dataset.act;
    try {
      if (act === "edit" && (await faqForm(faqs[i]))) { render(); showToast("حُفظ التعديل"); }
      if (act === "up" || act === "down") {
        faqs = await moveRow("faqs", faqs, i, act === "up" ? -1 : 1);
        render();
      }
      if (act === "delete") {
        const ok = await confirmDialog({ title: "حذف السؤال", message: "سيُحذف السؤال وجوابه.", confirmText: "حذف السؤال", danger: true });
        if (!ok) return;
        await deleteRow("faqs", faqs[i].id);
        faqs.splice(i, 1);
        render();
        showToast("حُذف السؤال");
      }
    } catch (err) {
      showToast(adminErrorMessage(err));
    }
  });

  if (isAdmin && addBtn) {
    addBtn.innerHTML = svgIcon("plus");
    addBtn.classList.remove("hidden");
    addBtn.addEventListener("click", async () => {
      try {
        if (await faqForm(null)) { render(); showToast("أُضيف السؤال"); }
      } catch (err) {
        showToast(adminErrorMessage(err));
      }
    });
  }

  fetchFaqs()
    .then((data) => { faqs = data; render(); })
    .catch(() => { box.innerHTML = `<div class="empty">تعذر التحميل، تحقق من الاتصال</div>`; });
}
