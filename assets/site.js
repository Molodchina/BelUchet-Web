(function () {
  "use strict";

  const cfg = window.BELUCHET_CONFIG;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const state = { rates: { ...cfg.rates.fallback } };

  function apiUrl(path) {
    return `${String(cfg.brand.apiBaseUrl || "").replace(/\/$/, "")}${path}`;
  }

  function money(value, currency = "USD") {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      maximumFractionDigits: 0
    }).format(Number.isFinite(value) ? value : 0);
  }

  function number(value) {
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0);
  }

  function setConfigText() {
    $$('[data-config]').forEach((node) => {
      const path = node.getAttribute("data-config").split(".");
      let value = cfg;
      for (const key of path) value = value && value[key];
      if (value) node.textContent = value;
    });
    $$('[data-current-year]').forEach((node) => {
      node.textContent = String(new Date().getFullYear());
    });
  }

  function initNavigation() {
    const toggle = $(".nav-toggle");
    if (!toggle) return;
    const close = () => {
      document.body.classList.remove("menu-open");
      toggle.setAttribute("aria-expanded", "false");
    };
    toggle.addEventListener("click", () => {
      const open = document.body.classList.toggle("menu-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    $$(".nav-links a").forEach((link) => link.addEventListener("click", close));
    window.addEventListener("resize", () => {
      if (window.innerWidth > 980) close();
    });
  }

  async function loadRates() {
    const status = $("[data-rate-status]");
    try {
      const apiResponse = await fetch(apiUrl("/api/v1/rates"), { cache: "no-store" });
      const apiData = await apiResponse.json();
      if (apiResponse.ok && apiData?.rates) {
        state.rates = { ...state.rates, ...apiData.rates };
        if (status) status.textContent = apiData.source === "CBR" ? "Валютный пересчёт обновлён по курсу ЦБ РФ." : "Для валютного пересчёта используется резервный курс. Итог подтвердит менеджер.";
        calculate();
        return;
      }
      const response = await fetch("https://www.cbr.ru/scripts/XML_daily.asp", { cache: "no-store" });
      if (!response.ok) throw new Error("rate request failed");
      const xml = await response.text();
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      const findRate = (code) => {
        const item = Array.from(doc.querySelectorAll("Valute")).find((row) => row.querySelector("CharCode")?.textContent === code);
        const nominal = Number(item?.querySelector("Nominal")?.textContent || 1);
        const value = Number((item?.querySelector("Value")?.textContent || "").replace(",", "."));
        return value / nominal;
      };
      state.rates.USD_RUB = findRate("USD") || state.rates.USD_RUB;
      state.rates.EUR_RUB = findRate("EUR") || state.rates.EUR_RUB;
      if (status) status.textContent = "Валютный пересчёт обновлён по курсу ЦБ РФ.";
    } catch (error) {
      if (status) status.textContent = "Для валютного пересчёта используется резервный курс. Итог подтвердит менеджер.";
    }
    calculate();
  }

  function toUsd(value, currency) {
    if (currency === "USD") return value;
    if (currency === "EUR") return value * state.rates.EUR_RUB / state.rates.USD_RUB;
    if (currency === "RUB") return value / state.rates.USD_RUB;
    if (currency === "BYN") return value * state.rates.BYN_RUB / state.rates.USD_RUB;
    return value;
  }

  function signedDiscount(value, currency = "RUB") {
    return `−${money(Math.abs(value), currency)}`;
  }

  function bandIndex(value, bands) {
    const index = bands.findIndex((maxValue) => value <= maxValue);
    return index === -1 ? bands.length : index;
  }

  function scenarioCosts(form) {
    const basis = form.elements.basis.value;
    const packageType = form.elements.package.value;
    const pricingKey = basis === "vng-realestate" ? "vngRealEstate" : basis;
    const term = basis === "rvp" ? Number(form.elements.term.value || 1) : 1;
    const base = cfg.pricingUsd.scenarioPackages[pricingKey][packageType]
      + (basis === "rvp" ? cfg.pricingUsd.rvpExtraYear * (term - 1) : 0);
    const labels = {
      rvp: `РВП на ${term} ${term === 1 ? "год" : term < 5 ? "года" : "лет"}`,
      vng: "ВНЖ",
      "vng-realestate": "ВНЖ: индивидуальный сценарий"
    };
    return { base, label: labels[basis] };
  }

  function complexityPrice(carPriceUsd, power) {
    const rules = cfg.pricingUsd.complexity;
    if (carPriceUsd > rules.specialPriceUsd || power > rules.specialPowerHp) return rules.special;
    if (carPriceUsd > rules.premiumPriceUsd || power > rules.premiumPowerHp) return rules.premium;
    return 0;
  }

  function rfUtilCost(form) {
    const rules = cfg.calculator.rfUtil;
    const age = form.elements.age.value === "under3" ? "under3" : "over3";
    const engineType = form.elements.engineType.value;
    const useMode = form.elements.useMode.value;
    const power = Math.max(0, Number(form.elements.power.value || 0));
    const volume = Math.max(0, Number(form.elements.volume.value || 0));
    const personal = rules.personalUse;
    const reducedPersonal = useMode === "personal" && (
      (engineType === "ev" && power <= personal.evMaxPowerHp)
      || (engineType === "ice" && volume <= personal.iceMaxVolume && power <= personal.iceMaxPowerHp)
    );

    let coefficient;
    if (reducedPersonal) {
      coefficient = personal[age];
    } else if (engineType === "ev") {
      coefficient = rules.evCommercialCoefficients[age][bandIndex(power, rules.evPowerBandsHp)];
    } else {
      const volumeRow = rules.iceCommercialCoefficients.find((row) => volume <= row.maxVolume)
        || rules.iceCommercialCoefficients[rules.iceCommercialCoefficients.length - 1];
      coefficient = volumeRow[age][bandIndex(power, rules.powerBandsHp)];
    }

    const calculationYear = Number(form.elements.calculationYear?.value || 2026);
    if (calculationYear < rules.coefficientBaseYear) {
      coefficient = Math.round((coefficient / 1.1) * 100) / 100;
    }

    return {
      coefficient,
      amountRub: Math.round(coefficient * rules.baseRateRub),
      reducedPersonal,
      age,
      useMode,
      calculationYear
    };
  }

  function calculate() {
    const form = $("#calculator-form");
    if (!form) return;

    const rawPrice = Number(form.elements.price.value || 0);
    const currency = form.elements.currency.value;
    const carPriceUsd = toUsd(rawPrice, currency);
    const volume = Number(form.elements.volume.value || 0);
    const power = Number(form.elements.power.value || 0);
    const basis = scenarioCosts(form);
    const complexity = complexityPrice(carPriceUsd, power);
    const packageType = form.elements.package.value;
    const gai = form.elements.gai?.checked && packageType === "self" ? cfg.pricingUsd.gaiHelp : 0;
    const annual = form.elements.annual?.checked ? cfg.pricingUsd.annualControl : 0;
    const support = form.elements.support?.checked && form.elements.basis.value !== "rvp" ? cfg.pricingUsd.statusSupportYear : 0;
    const optionalExtras = gai + annual + support;
    const extras = complexity + optionalExtras;
    const scenarioUsd = basis.base + extras;
    const scenarioRub = scenarioUsd * state.rates.USD_RUB;
    const rfUtil = rfUtilCost(form);
    const benefitRub = rfUtil.amountRub - scenarioRub;
    const engineType = form.elements.engineType.value;
    const ageLabel = form.elements.age.value === "under3" ? "до 3 лет" : "старше 3 лет";
    const useLabel = form.elements.useMode.value === "personal" ? "личное пользование" : "обычный коэффициент";
    const engineLabel = engineType === "ev" ? "электро / последовательный гибрид" : "ДВС / иной гибрид";

    const values = {
      "[data-out-benefit]": money(benefitRub, "RUB"),
      "[data-out-util-discount]": signedDiscount(rfUtil.amountRub),
      "[data-out-util-rf]": money(rfUtil.amountRub, "RUB"),
      "[data-out-formula]": `коэффициент ${String(rfUtil.coefficient).replace(".", ",")} × ${money(cfg.calculator.rfUtil.baseRateRub, "RUB")}`,
      "[data-out-scenario]": money(scenarioUsd),
      "[data-out-scenario-rub]": money(scenarioRub, "RUB"),
      "[data-out-base]": money(basis.base),
      "[data-out-extras]": money(optionalExtras),
      "[data-out-basis]": basis.label,
      "[data-out-vehicle]": engineType === "ev" ? `${engineLabel}, ${number(power)} л.с., ${ageLabel}` : `${number(volume)} см³, ${number(power)} л.с., ${ageLabel}`,
      "[data-out-use]": useLabel,
      "[data-out-rate-kind]": rfUtil.reducedPersonal ? "льготный коэффициент для личного пользования" : "обычный коэффициент",
      "[data-out-calculation-year]": String(rfUtil.calculationYear)
    };
    Object.entries(values).forEach(([selector, value]) => {
      $$(selector).forEach((node) => {
        node.textContent = value;
      });
    });
    const benefitNode = $("[data-out-benefit]");
    benefitNode?.classList.toggle("negative", benefitRub < 0);
    const benefitLabel = $("[data-benefit-label]");
    if (benefitLabel) benefitLabel.textContent = benefitRub >= 0 ? "Потенциальная выгода после выбранного тарифа" : "Разница после выбранного тарифа";
    const complexityRow = $("[data-complexity-row]");
    if (complexityRow) complexityRow.classList.toggle("hidden", complexity === 0);
    const complexityNode = $("[data-out-complexity]");
    if (complexityNode) complexityNode.textContent = money(complexity);
    const termField = $("[data-term-field]");
    if (termField) termField.classList.toggle("hidden", form.elements.basis.value !== "rvp");
    const supportField = $("[data-support-field]");
    if (supportField) supportField.classList.toggle("hidden", form.elements.basis.value === "rvp");
    const volumeField = $("[data-volume-field]");
    if (volumeField) volumeField.classList.toggle("hidden", engineType === "ev");
    const originWarning = $("[data-origin-warning]");
    if (originWarning) originWarning.classList.toggle("hidden", form.elements.origin.value === "eaeu");
    const personalNote = $("[data-personal-note]");
    if (personalNote) {
      personalNote.textContent = rfUtil.reducedPersonal
        ? "Применён льготный коэффициент. Право на него зависит от обстоятельств ввоза и подтверждается по документам."
        : "Применён обычный коэффициент: параметры автомобиля не подпадают под льготный диапазон либо выбран не личный ввоз.";
    }

    const contactLink = $("[data-calculator-contact]");
    if (contactLink) {
      const params = new URLSearchParams({
        car: engineType === "ev" ? `${engineLabel}, ${power} л.с.` : `${volume} см³, ${power} л.с.`,
        budget: rawPrice ? `${number(rawPrice)} ${currency}` : "",
        package: packageType,
        basis: form.elements.basis.value === "vng-realestate" ? "vng" : form.elements.basis.value,
        calculation: `${engineLabel}; ${ageLabel}; ${useLabel}; ориентир утильсбора РФ для ${rfUtil.calculationYear} года: ${money(rfUtil.amountRub, "RUB")}; выбранный сценарий БелУчёт: ${money(scenarioUsd)}; потенциальная разница: ${money(benefitRub, "RUB")}.`
      });
      contactLink.href = `/contacts/?${params.toString()}`;
    }
  }

  function initCalculator() {
    const form = $("#calculator-form");
    if (!form) return;
    const requestedPackage = new URLSearchParams(window.location.search).get("package");
    if (["self", "assisted", "full"].includes(requestedPackage)) {
      form.elements.package.value = requestedPackage;
    }
    form.addEventListener("input", calculate);
    form.addEventListener("change", calculate);
    $("[data-reset-calculator]")?.addEventListener("click", () => {
      form.reset();
      calculate();
    });
    calculate();
    loadRates();
  }

  function initFaqModes() {
    const toggle = $("#faq-mode");
    if (!toggle) return;
    const setMode = () => document.documentElement.setAttribute("data-faq-mode", toggle.checked ? "legal" : "simple");
    toggle.addEventListener("change", setMode);
    setMode();
  }

  function initLeadForm() {
    const form = $("#lead-form");
    if (!form) return;
    const params = new URLSearchParams(window.location.search);
    for (const name of ["car", "budget", "package", "basis"]) {
      if (params.get(name) && form.elements[name]) form.elements[name].value = params.get(name);
    }
    if (params.get("calculation") && form.elements.comment && !form.elements.comment.value) {
      form.elements.comment.value = `Предварительный расчёт: ${params.get("calculation")}`;
    }
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      if (data.get("website")) return;
      const submit = form.querySelector('[type="submit"]');
      const submitLabel = submit?.textContent || "Отправить";
      const payload = {
        source: "website",
        status: "new",
        name: data.get("name"),
        contact: data.get("contact"),
        car: data.get("car"),
        budget: data.get("budget"),
        package_type: data.get("package"),
        basis_type: data.get("basis"),
        comment: data.get("comment"),
        client_name: data.get("name"),
        preferred_contact: "auto",
        calculation_version: cfg.calculator.rfUtil.version,
        utm_source: params.get("utm_source"),
        utm_medium: params.get("utm_medium"),
        utm_campaign: params.get("utm_campaign"),
        utm_content: params.get("utm_content"),
        utm_term: params.get("utm_term"),
        website: data.get("website")
      };
      if (submit) {
        submit.disabled = true;
        submit.textContent = "Отправляем...";
      }
      try {
        const response = await fetch(apiUrl("/api/v1/leads"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (response.ok) {
          window.location.href = "/thank-you/";
          return;
        }
      } catch (error) {
        // The email fallback keeps the form usable on static hosting.
      }
      const body = encodeURIComponent([
        "Заявка БелУчёт",
        `Имя: ${payload.name}`,
        `Контакт: ${payload.contact}`,
        `Авто: ${payload.car || "не указано"}`,
        `Бюджет: ${payload.budget || "не указан"}`,
        `Комментарий: ${payload.comment || "нет"}`
      ].join("\n"));
      window.location.href = `mailto:${cfg.brand.email}?subject=${encodeURIComponent("Заявка БелУчёт")}&body=${body}`;
      if (submit) {
        submit.disabled = false;
        submit.textContent = submitLabel;
      }
    });
  }

  function readConsent() {
    const cookieName = `${cfg.cookies.consentName}=`;
    const raw = document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(cookieName));
    if (!raw) return null;
    try {
      return JSON.parse(decodeURIComponent(raw.slice(cookieName.length)));
    } catch (error) {
      return null;
    }
  }

  function activateConsentFeatures(consent) {
    if (!consent || consent.version !== cfg.cookies.policyVersion) return;
    if (!consent.analytics && !consent.marketing) {
      const optionalPrefixes = ["_ga", "_gid", "_ym_", "yandexuid", "_fbp"];
      document.cookie.split(";").forEach((item) => {
        const name = item.split("=")[0].trim();
        if (optionalPrefixes.some((prefix) => name.startsWith(prefix))) {
          document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
        }
      });
    }
    document.dispatchEvent(new CustomEvent("beluchet:consent", { detail: consent }));
  }

  function writeConsent(preferences) {
    const consent = {
      version: cfg.cookies.policyVersion,
      necessary: true,
      analytics: Boolean(preferences.analytics),
      marketing: Boolean(preferences.marketing),
      updatedAt: new Date().toISOString()
    };
    const value = encodeURIComponent(JSON.stringify(consent));
    const maxAge = cfg.cookies.maxAgeDays * 24 * 60 * 60;
    document.cookie = `${cfg.cookies.consentName}=${value}; Max-Age=${maxAge}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    activateConsentFeatures(consent);
  }

  function initCookieConsent() {
    if (!cfg.cookies) return;
    const footerTitles = $$(".footer-title");
    const documentsColumn = footerTitles.find((title) => title.textContent.trim() === "Документы")?.parentElement;
    if (documentsColumn && !$("[data-cookie-settings-link]", documentsColumn)) {
      documentsColumn.insertAdjacentHTML("beforeend", '<p><a href="/cookies/">Cookie</a></p><p><a href="#" data-cookie-settings-link>Настройки cookie</a></p>');
    }
    const current = readConsent();
    const gpcEnabled = navigator.globalPrivacyControl === true;
    const root = document.createElement("div");
    root.innerHTML = `
      <section class="cookie-banner" data-cookie-banner role="dialog" aria-label="Настройки cookie">
        <div><strong>Настройки cookie</strong><p>Необходимые cookie обеспечивают работу сайта. Аналитику и маркетинговые технологии включаем только с вашего согласия.</p></div>
        <div class="cookie-actions">
          <button class="button secondary small-button" type="button" data-cookie-essential>Только необходимые</button>
          <button class="button secondary small-button" type="button" data-cookie-settings>Настроить</button>
          <button class="button small-button" type="button" data-cookie-all>Принять все</button>
        </div>
      </section>
      <dialog class="cookie-dialog" data-cookie-dialog aria-labelledby="cookie-title">
        <form method="dialog" class="cookie-dialog-card">
          <div class="modal-head"><div><div class="eyebrow">Конфиденциальность</div><h2 id="cookie-title">Настройки cookie</h2></div><button class="icon-button" value="cancel" aria-label="Закрыть">×</button></div>
          <div class="cookie-options">
            <label class="cookie-option"><span><strong>Необходимые</strong><small>Выбор настроек и техническая работа интерфейса.</small></span><input type="checkbox" checked disabled></label>
            <label class="cookie-option"><span><strong>Аналитические</strong><small>Помогают понять, какие страницы и функции полезны.</small></span><input name="analytics" type="checkbox"></label>
            <label class="cookie-option"><span><strong>Маркетинговые</strong><small>Используются для оценки рекламных кампаний. Сейчас не подключены.</small></span><input name="marketing" type="checkbox"></label>
          </div>
          <p class="small">Подробнее — в <a href="/cookies/">политике использования cookie</a>.</p>
          <div class="modal-actions"><button class="button secondary" type="button" data-cookie-dialog-essential>Только необходимые</button><button class="button" value="save">Сохранить выбор</button></div>
        </form>
      </dialog>`;
    document.body.appendChild(root);
    const banner = $("[data-cookie-banner]", root);
    const dialog = $("[data-cookie-dialog]", root);
    const settingsForm = $("form", dialog);
    const openSettings = () => {
      const saved = readConsent();
      settingsForm.elements.analytics.checked = Boolean(saved?.analytics) && !gpcEnabled;
      settingsForm.elements.marketing.checked = Boolean(saved?.marketing) && !gpcEnabled;
      dialog.showModal();
    };
    $("[data-cookie-essential]", root).addEventListener("click", () => { writeConsent({ analytics: false, marketing: false }); banner.hidden = true; });
    $("[data-cookie-all]", root).addEventListener("click", () => { writeConsent({ analytics: !gpcEnabled, marketing: !gpcEnabled }); banner.hidden = true; });
    $("[data-cookie-settings]", root).addEventListener("click", openSettings);
    $("[data-cookie-dialog-essential]", root).addEventListener("click", () => { writeConsent({ analytics: false, marketing: false }); dialog.close(); banner.hidden = true; });
    dialog.addEventListener("close", () => {
      if (dialog.returnValue === "save") {
        writeConsent({ analytics: settingsForm.elements.analytics.checked && !gpcEnabled, marketing: settingsForm.elements.marketing.checked && !gpcEnabled });
        banner.hidden = true;
      }
    });
    $$('[data-cookie-settings-link]').forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); openSettings(); }));
    if (current?.version === cfg.cookies.policyVersion) {
      banner.hidden = true;
      activateConsentFeatures(current);
    } else if (gpcEnabled) {
      writeConsent({ analytics: false, marketing: false });
      banner.hidden = true;
    }
  }

  function initBasisCheck() {
    const dialog = $("[data-basis-dialog]");
    if (!dialog) return;
    $$('[data-open-basis-check]').forEach((button) => button.addEventListener("click", () => dialog.showModal()));
    const form = $("[data-basis-form]", dialog);
    const result = $("[data-basis-result]", dialog);
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      result.hidden = false;
      const basisText = data.get("basis") === "unsure" ? "Мы предложим подходящий вариант после уточнения документов." : "Выбранный вариант учтём в расчёте.";
      const visitText = data.get("visits") === "minimum" ? "Подберём формат с минимальным количеством самостоятельных визитов." : "Можно выбрать экономичный формат и часть этапов пройти самостоятельно.";
      result.innerHTML = `<strong>Следующий шаг — персональный расчёт.</strong><p>${basisText} ${visitText}</p><a class="button" href="/calculator/">Перейти к калькулятору</a>`;
    });
  }

  function initRealCases() {
    const target = $("[data-real-cases]");
    if (!target) return;
    const cases = Array.isArray(window.BELUCHET_REAL_CASES) ? window.BELUCHET_REAL_CASES : [];
    if (!cases.length) return;
    target.innerHTML = cases.map((item, index) => `<article class="card case-card real-case"><button class="case-photo-button" type="button" data-case-index="${index}" aria-label="Открыть фотографии кейса ${item.title}"><img src="${item.cover}" alt="${item.alt}" loading="lazy"></button><div class="case-body"><span class="tag green">Реальный кейс · ${item.completed}</span><h3>${item.title}</h3><p>${item.summary}</p><div class="case-facts"><span>${item.basis}</span><span>${item.term}</span><span>${item.visits}</span></div><button class="button secondary" type="button" data-case-index="${index}">Подробнее</button></div></article>`).join("");
    $$('[data-case-index]', target).forEach((button) => button.addEventListener("click", () => {
      const item = cases[Number(button.dataset.caseIndex)];
      const dialog = $("[data-case-dialog]");
      if (!dialog || !item) return;
      $("[data-case-dialog-content]", dialog).innerHTML = `<div class="case-dialog-grid"><div class="case-gallery">${item.photos.map((photo) => `<img src="${photo.src}" alt="${photo.alt}" loading="lazy">`).join("")}</div><div><span class="tag green">Реальный кейс · ${item.completed}</span><h2>${item.title}</h2><p>${item.description}</p><dl class="case-details"><div><dt>Основание</dt><dd>${item.basis}</dd></div><div><dt>Срок</dt><dd>${item.term}</dd></div><div><dt>Поездки</dt><dd>${item.visits}</dd></div><div><dt>Формат</dt><dd>${item.package}</dd></div></dl>${item.quote ? `<blockquote>${item.quote}</blockquote>` : ""}<a class="button" href="/calculator/">Рассчитать похожий сценарий</a></div></div>`;
      dialog.showModal();
    }));
  }

  setConfigText();
  initNavigation();
  initCalculator();
  initFaqModes();
  initLeadForm();
  initCookieConsent();
  initBasisCheck();
  initRealCases();
})();
