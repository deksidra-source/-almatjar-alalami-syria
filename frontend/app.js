const toast = document.querySelector("#toast");
let toastTimer;

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2800);
}

const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const provinceFilter = document.querySelector("#province-filter");
const shippingFilter = document.querySelector("#shipping-filter");
searchForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = searchInput?.value.trim();
  const province = provinceFilter?.value;
  const shipping = shippingFilter?.value;
  const scope = [province && province !== "كل المحافظات" ? `في ${province}` : "", shipping && shipping !== "كل الخيارات" ? `بشحن ${shipping}` : ""].filter(Boolean).join("، ");
  showToast(query ? `سيتم البحث عن «${query}»${scope ? ` ${scope}` : ""} بعد اعتماد الكتالوج.` : "اكتب اسم المنتج أو القسم للبحث.");
});

const roleCards = document.querySelectorAll(".role-card");
roleCards.forEach((card) => {
  card.addEventListener("click", () => {
    if (card.classList.contains("locked")) {
      showToast("هذا القسم مؤجل حتى اعتماد التكامل والصلاحيات.");
      return;
    }
    roleCards.forEach((item) => item.classList.remove("selected"));
    card.classList.add("selected");
    const role = card.dataset.role;
    const workspace = document.querySelector("#workspace");
    const largeWorkspace = document.querySelector("#large-workspace");
    if (workspace) workspace.hidden = role !== "small";
    if (largeWorkspace) largeWorkspace.hidden = role !== "large";
    const target = role === "small" ? workspace : role === "large" ? largeWorkspace : document.querySelector("#categories");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    showToast(role === "small" ? "مساحة المتجر الصغير جاهزة للمعاينة." : role === "large" ? "مساحة المتجر الكبير جاهزة لطلبات العرض." : "أنت الآن في مساحة المشتري.");
  });
});

document.querySelectorAll("[data-soon]").forEach((button) => {
  button.addEventListener("click", () => showToast(button.dataset.soon));
});

document.querySelector("#cart-button")?.addEventListener("click", () => showToast("السلة فارغة الآن؛ سيظهر المنتج بعد اعتماد الكتالوج."));

const promotionForm = document.querySelector("#promotion-form");
const promotionStoreType = document.querySelector("#promotion-store-type");
const promotionPriceValue = document.querySelector("#promotion-price-value");
const promotionItem = document.querySelector("#promotion-item");
const promotionDuration = document.querySelector("#promotion-duration");
const promotionPaymentInputs = document.querySelectorAll('input[name="promotion-payment"]');

function getPromotionPrice() {
  return promotionStoreType?.value === "large" ? 10 : 1;
}
function refreshPromotionPrice() {
  if (promotionPriceValue) promotionPriceValue.textContent = `${getPromotionPrice()} دولار`;
  if (promotionDuration) {
    promotionDuration.value = "7";
    promotionDuration.readOnly = true;
    promotionDuration.setAttribute("aria-describedby", "promotion-duration-note");
  }
}
promotionStoreType?.addEventListener("change", refreshPromotionPrice);
refreshPromotionPrice();
promotionForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const item = promotionItem?.value.trim();
  const selectedPayment = document.querySelector('input[name="promotion-payment"]:checked')?.value || "manual";
  if (!item) {
    showToast("أدخل معرّف المنتج أو العرض أولًا.");
    promotionItem?.focus();
    return;
  }
  if (selectedPayment !== "manual") {
    showToast("Sham Cash وiCash غير مفعّلين حاليًا؛ اختر الدفع اليدوي.");
    return;
  }
  const request = { id: `local-${Date.now()}`, item, storeType: promotionStoreType?.value || "small", priceUsd: getPromotionPrice(), durationDays: 7, paymentProvider: "manual", status: "pending", createdAt: new Date().toISOString() };
  const previous = JSON.parse(localStorage.getItem("almatjar-promotion-requests") || "[]");
  localStorage.setItem("almatjar-promotion-requests", JSON.stringify([request, ...previous].slice(0, 20)));
  showToast(`تم إرسال الطلب للمراجعة اليدوية: ${request.priceUsd} دولار لمدة 7 أيام.`);
  promotionForm.reset();
  refreshPromotionPrice();
});
promotionPaymentInputs.forEach((input) => input.addEventListener("change", () => {
  if (input.disabled) showToast("هذا الخيار مؤجل وسيُفعّل لاحقًا بعد الاعتماد.");
}));

const consent = document.querySelector("#legal-consent");
document.querySelector("#login-button")?.addEventListener("click", () => {
  showToast(consent?.checked ? "سيتم ربط تسجيل الدخول الآمن في المرحلة الخلفية." : "يرجى الموافقة على الشروط وإخلاء المسؤولية أولًا.");
});

const drawer = document.querySelector("#side-drawer");
const drawerToggle = document.querySelector("#drawer-toggle");
const drawerClose = document.querySelector("#drawer-close");
const drawerBackdrop = document.querySelector("#drawer-backdrop");
function setDrawer(open) {
  if (!drawer || !drawerToggle || !drawerBackdrop) return;
  drawer.classList.toggle("open", open);
  drawer.setAttribute("aria-hidden", String(!open));
  drawerToggle.setAttribute("aria-expanded", String(open));
  drawerBackdrop.hidden = !open;
  if (open) drawerClose?.focus(); else drawerToggle.focus();
}
drawerToggle?.addEventListener("click", () => setDrawer(true));
drawerClose?.addEventListener("click", () => setDrawer(false));
drawerBackdrop?.addEventListener("click", () => setDrawer(false));
drawer?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setDrawer(false)));
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && drawer?.classList.contains("open")) setDrawer(false); });

document.querySelectorAll(".bottom-nav a, .desktop-nav a").forEach((link) => link.addEventListener("click", () => {
  document.querySelectorAll(".bottom-nav a, .desktop-nav a").forEach((item) => item.classList.remove("current", "active"));
  link.classList.add(link.closest(".bottom-nav") ? "current" : "active");
}));
