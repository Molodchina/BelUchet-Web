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

  const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  const initialSearch = new URLSearchParams(location.search);
  // Preserve campaign labels across internal links, not arbitrary URLs or form fields.
  const attribution = Object.fromEntries(utmKeys.map((key) => {
    const value = initialSearch.get(key) || "";
    return [key, /^[\p{L}\p{N} _+.~:-]{1,120}$/u.test(value) ? value : null];
  }));

  function withAttribution(path) {
    const url = new URL(path, location.origin);
    if (url.origin !== location.origin || !/^\/(?:$|(?:calculator|cases|contacts|faq|process|services)\/$)/.test(url.pathname)) return path;
    for (const [key, value] of Object.entries(attribution)) {
      if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
    }
    return url.pathname + url.search + url.hash;
  }

  function initAttribution() {
    if (!Object.values(attribution).some(Boolean)) return;
    $$('a[href^="/"]:not([href^="//"]):not([data-contact-calculation])').forEach((link) => {
      link.setAttribute("href", withAttribution(link.getAttribute("href")));
    });
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

  function operatorDetailsReady() {
    const operator = cfg.legal?.operator || {};
    const required = operator.type === "npd"
      ? [operator.fullName, operator.inn, operator.npdRegistrationDate, operator.address]
      : [operator.fullName, operator.inn, operator.registrationNumber, operator.address];
    return required.every((value) => String(value || "").trim());
  }

  function leadCaptureReady() {
    return operatorDetailsReady() && cfg.legal?.personalDataRegistrationReady === true;
  }

  function initLegalDetails() {
    const operator = cfg.legal?.operator || {};
    const operatorReady = operatorDetailsReady();
    const identityRequired = operator.type === "npd"
      ? [operator.fullName, operator.inn, operator.npdRegistrationDate]
      : [operator.fullName, operator.inn, operator.registrationNumber];
    const operatorIdentityReady = identityRequired.every((value) => String(value || "").trim());
    $$('[data-operator-name]').forEach((node) => {
      node.textContent = operator.fullName || cfg.brand.company;
    });
    $$('[data-operator-details]').forEach((node) => {
      node.hidden = !operatorIdentityReady;
    });
    $$('[data-operator-missing]').forEach((node) => {
      node.hidden = operatorReady;
    });
    $$('[data-operator-business-registration-row]').forEach((node) => {
      node.hidden = operator.type === "npd" || !operator.registrationNumber;
    });
    $$('[data-operator-npd-row]').forEach((node) => {
      node.hidden = operator.type !== "npd";
    });
    $$('[data-operator-address-row]').forEach((node) => {
      node.hidden = !operator.address;
    });
    $$('[data-config-email]').forEach((node) => {
      const path = node.getAttribute("data-config-email").split(".");
      let value = cfg;
      for (const key of path) value = value && value[key];
      if (value) node.href = `mailto:${value}`;
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

  const packageLabels = {
    self: "Самостоятельный",
    assisted: "С сопровождением",
    full: "Полный цикл"
  };

  function complexityPriceRub(carPriceUsd, power) {
    const rules = cfg.pricingRub.complexity;
    if (carPriceUsd > rules.specialPriceUsd || power > rules.specialPowerHp) return rules.special;
    if (carPriceUsd > rules.premiumPriceUsd || power > rules.premiumPowerHp) return rules.premium;
    return 0;
  }

  function initCalculator() {
    const form = $("#calculator-form");
    if (!form) return;
    const requestedPackage = initialSearch.get("package");
    if (Object.hasOwn(packageLabels, requestedPackage)) form.elements.package.value = requestedPackage;
    for (const [name, [min, max]] of Object.entries({ price: [0, 10000000], power: [1, 2000] })) {
      const rawValue = initialSearch.get(name);
      const value = Number(rawValue);
      if (rawValue !== null && rawValue.trim() && Number.isFinite(value) && value >= min && value <= max) {
        form.elements[name].value = String(value);
      }
    }
    const calculate = () => {
      const packageType = form.elements.package.value;
      const base = cfg.pricingRub.scenarioPackages.rvp[packageType];
      const complexity = complexityPriceRub(
        form.elements.price.validity.valid ? Number(form.elements.price.value || 0) : 0,
        form.elements.power.validity.valid ? Number(form.elements.power.value || 0) : 0
      );
      const canAddRegistration = packageType === "self";
      form.elements.gai.disabled = !canAddRegistration;
      if (!canAddRegistration) form.elements.gai.checked = false;
      $("[data-gai-description]").textContent = canAddRegistration
        ? `Доплата ${money(cfg.pricingRub.gaiHelp, "RUB")} для самостоятельного тарифа.`
        : "В выбранном тарифе помощь уже входит в согласованный объём.";
      const extras = (form.elements.gai.checked ? cfg.pricingRub.gaiHelp : 0)
        + (form.elements.annual.checked ? cfg.pricingRub.annualControl : 0);
      const total = base + complexity + extras;
      const values = { scenario: `от ${money(total, "RUB")}`, basis: packageLabels[packageType],
        base: money(base, "RUB"), complexity: money(complexity, "RUB"), extras: money(extras, "RUB") };
      for (const [key, value] of Object.entries(values)) $(`[data-out-${key}]`).textContent = value;
      const params = new URLSearchParams({ package: packageType, basis: "rvp", estimate: String(total) });
      $("[data-contact-calculation]").href = withAttribution(`/contacts/?${params}`);
    };
    $$("[data-package-price]", form).forEach((price) => {
      price.textContent = `от ${money(cfg.pricingRub.scenarioPackages.rvp[price.dataset.packagePrice], "RUB")}`;
    });
    form.addEventListener("submit", (event) => event.preventDefault());
    form.addEventListener("input", calculate);
    form.addEventListener("change", calculate);
    $("[data-reset-calculator]").addEventListener("click", () => { form.reset(); calculate(); });
    calculate();
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
    form.elements.consent?.addEventListener("change", () => form.elements.consent.setCustomValidity(""));
    const feedback = $("[data-lead-feedback]", form);
    let pending = false;
    for (const name of ["car", "budget", "package", "basis"]) {
      const value = initialSearch.get(name);
      if (!value || !form.elements[name]) continue;
      const field = form.elements[name];
      if (field instanceof HTMLSelectElement && !Array.from(field.options).some((option) => option.value === value)) continue;
      field.value = field.maxLength > 0 ? value.slice(0, field.maxLength) : value;
    }
    const requestedEstimate = initialSearch.get("estimate");
    if (/^\d{1,7}$/.test(requestedEstimate || "") && Object.hasOwn(packageLabels, form.elements.package.value) && !form.elements.comment.value) {
      form.elements.comment.value = `Ориентир стоимости услуг из калькулятора: ${money(Number(requestedEstimate), "RUB")}.`;
    }
    if (!leadCaptureReady()) {
      const submit = form.querySelector('[type="submit"]');
      if (submit) {
        submit.disabled = true;
        submit.textContent = "Приём заявок временно приостановлен";
      }
      form.insertAdjacentHTML("afterbegin", '<div class="notice" data-operator-form-warning><strong>Форма пока недоступна.</strong> До запуска необходимо завершить уведомление Роскомнадзора, проверить российскую инфраструктуру обработки данных и включить приём заявок в конфигурации.</div>');
      return;
    }
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      if (pending || data.get("website")) return;
      if (data.get("consent") !== "yes") {
        form.elements.consent?.setCustomValidity("Подтвердите отдельное согласие на обработку персональных данных.");
        form.reportValidity();
        return;
      }
      form.elements.consent?.setCustomValidity("");
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
        comment: [data.get("comment"), data.get("listing_url") ? `Ссылка на объявление: ${data.get("listing_url")}` : ""].filter(Boolean).join("\n"),
        client_name: data.get("name"),
        preferred_contact: "auto",
        calculation_version: cfg.calculator.serviceEstimateVersion,
        consent_given: data.get("consent") === "yes",
        consent_version: cfg.legal.personalDataConsentVersion,
        privacy_policy_version: cfg.legal.privacyPolicyVersion,
        consent_timestamp: new Date().toISOString(),
        consent_source: `${window.location.origin}${window.location.pathname}`,
        utm_source: attribution.utm_source,
        utm_medium: attribution.utm_medium,
        utm_campaign: attribution.utm_campaign,
        utm_content: attribution.utm_content,
        utm_term: attribution.utm_term,
        website: data.get("website")
      };
      pending = true;
      if (feedback) feedback.textContent = "";
      if (submit) {
        submit.disabled = true;
        submit.textContent = "Отправляем...";
      }
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(apiUrl("/api/v1/leads"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        if (!response.ok) throw new Error("Lead was not acknowledged");
        // Set only an anonymous marker after an acknowledged POST. A direct or repeated
        // visit to /thank-you/ must not count as a lead.
        if (metrikaId() && allowsAnalytics(readConsent())) {
          try { sessionStorage.setItem("beluchet-lead-sent", "1"); } catch (_) {}
        }
        location.assign("/thank-you/");
      } catch (_) {
        if (feedback) {
          feedback.textContent = "Не удалось подтвердить отправку. Данные остались в форме. Попробуйте ещё раз немного позже.";
          feedback.focus();
        }
        pending = false;
        if (submit) {
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
      } finally {
        window.clearTimeout(timeout);
      }
    });
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = false;
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

  function deleteOptionalCookies(prefixes) {
    document.cookie.split(";").forEach((item) => {
      const name = item.split("=")[0].trim();
      if (prefixes.some((prefix) => name.startsWith(prefix))) {
        document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
        document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.${location.hostname}; SameSite=Lax`;
      }
    });
  }

  function metrikaId() {
    const raw = String(cfg.analytics?.yandexMetrikaId || "");
    const documentedVersion = cfg.analytics?.metrikaConsentPolicyVersion;
    // A real ID alone is not sufficient. The release must include the provider
    // disclosure and a new cookie policy version so old permissions never apply.
    if (!/^[1-9]\d{0,9}$/.test(raw) || !documentedVersion || documentedVersion !== cfg.cookies.policyVersion ||
        documentedVersion === "2026-08-27") return null;
    return Number(raw);
  }

  function allowsAnalytics(consent) {
    return consent?.version === cfg.cookies.policyVersion && consent.analytics === true && navigator.globalPrivacyControl !== true;
  }

  function initMetrika() {
    const id = metrikaId();
    if (!id) return;
    let leadSent = false;
    if (location.pathname === "/thank-you/") {
      try {
        leadSent = sessionStorage.getItem("beluchet-lead-sent") === "1";
        sessionStorage.removeItem("beluchet-lead-sent");
      } catch (_) {}
    }
    // Keep analytics off the intake page and URLs with any dynamic parameters.
    if (location.search || location.hash || !/^\/(?:$|(?:calculator|cases|faq|process|services|thank-you)\/$)/.test(location.pathname)) return;
    let loaded = false;
    const disableFlag = `disableYaCounter${id}`;
    const stop = () => {
      if (!loaded) return;
      window[disableFlag] = true;
      location.reload();
    };
    const checkConsent = () => {
      if (!allowsAnalytics(readConsent())) stop();
    };
    window.addEventListener("pageshow", checkConsent);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) checkConsent();
    });
    document.addEventListener("beluchet:consent", (event) => {
      if (!allowsAnalytics(event.detail)) {
        stop();
        return;
      }
      if (loaded) return;
      loaded = true;
      if (!window.ym) {
        const queue = function () { (queue.a = queue.a || []).push(arguments); };
        queue.l = Date.now();
        window.ym = queue;
      }
      window.ym(id, "init", { defer: true, webvisor: false, clickmap: false, trackLinks: false,
        trackHash: false, accurateTrackBounce: false, sendTitle: false, ecommerce: false, disableYtm: true });
      window.ym(id, "hit", location.origin + location.pathname, { title: "", referer: location.origin + "/" });
      if (leadSent) window.ym(id, "reachGoal", "lead_success");
      const script = document.createElement("script");
      script.async = true;
      script.referrerPolicy = "no-referrer";
      script.src = "https://mc.yandex.ru/metrika/tag.js";
      document.head.appendChild(script);
    });
  }

  function activateConsentFeatures(consent) {
    if (!consent || consent.version !== cfg.cookies.policyVersion) return;
    if (!consent.analytics) {
      deleteOptionalCookies(["_ga", "_gid", "_gat", "_ym_", "yandexuid", "yabs-sid"]);
      for (const key of ["localStorage", "sessionStorage"]) {
        try {
          const storage = window[key];
          Object.keys(storage).filter((name) => name.startsWith("_ym")).forEach((name) => storage.removeItem(name));
          if (key === "sessionStorage") storage.removeItem("beluchet-lead-sent");
        } catch (_) {}
      }
    }
    if (!consent.marketing) deleteOptionalCookies(["_fbp", "_gcl_"]);
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
    if (documentsColumn) {
      if (!$('a[href="/consent/"]', documentsColumn)) documentsColumn.insertAdjacentHTML("beforeend", '<p><a href="/consent/">Согласие на обработку ПДн</a></p>');
      if (!$('a[href="/cookies/"]', documentsColumn)) documentsColumn.insertAdjacentHTML("beforeend", '<p><a href="/cookies/">Cookie</a></p>');
      if (!$('a[href="/terms/"]', documentsColumn)) documentsColumn.insertAdjacentHTML("beforeend", '<p><a href="/terms/">Условия оказания и возврата</a></p>');
      if (!$('[data-cookie-settings-link]', documentsColumn)) documentsColumn.insertAdjacentHTML("beforeend", '<p><a href="#" data-cookie-settings-link>Настройки cookie</a></p>');
    }
    const current = readConsent();
    const gpcEnabled = navigator.globalPrivacyControl === true;
    const analyticsConfigured = Boolean(metrikaId());
    const marketingConfigured = Array.isArray(cfg.analytics?.marketingScripts) && cfg.analytics.marketingScripts.length > 0;
    const optionalConfigured = analyticsConfigured || marketingConfigured;
    const root = document.createElement("div");
    root.innerHTML = `
      <section class="cookie-banner" data-cookie-banner role="dialog" aria-label="Настройки cookie">
        <div><strong>Настройки cookie</strong><p>${analyticsConfigured ? 'Яндекс Метрика помогает измерять посещаемость сайта. Её можно разрешить или отказаться. <a href="/analytics-consent/">Согласие на веб-аналитику</a>.' : "Сайт сохраняет ваш выбор в необходимом cookie. Аналитика не подключена."}</p></div>
        <div class="cookie-actions">
          <button class="button secondary small-button" type="button" data-cookie-essential>${optionalConfigured ? "Только необходимые" : "Понятно"}</button>
          <button class="button secondary small-button" type="button" data-cookie-settings ${optionalConfigured ? "" : "hidden"}>Настроить</button>
          <button class="button secondary small-button" type="button" data-cookie-all ${analyticsConfigured ? "" : "hidden"}>Разрешить аналитику</button>
        </div>
      </section>
      <dialog class="cookie-dialog" data-cookie-dialog aria-labelledby="cookie-title">
        <form method="dialog" class="cookie-dialog-card">
          <div class="modal-head"><div><div class="eyebrow">Конфиденциальность</div><h2 id="cookie-title">Настройки cookie</h2></div><button class="icon-button" value="cancel" aria-label="Закрыть">×</button></div>
          <div class="cookie-options">
            <label class="cookie-option"><span><strong>Необходимые</strong><small>Выбор настроек и техническая работа интерфейса.</small></span><input type="checkbox" checked disabled></label>
            <label class="cookie-option"><span><strong>Яндекс Метрика</strong><small>${analyticsConfigured ? 'Я даю <a href="/analytics-consent/">согласие на веб-аналитику</a>.' : "Не подключена."}</small></span><input name="analytics" type="checkbox" ${analyticsConfigured ? "" : "disabled"}></label>
            <label class="cookie-option"><span><strong>Маркетинговые</strong><small>${marketingConfigured ? "Используются для оценки рекламных кампаний." : "Не подключены."}</small></span><input name="marketing" type="checkbox" ${marketingConfigured ? "" : "disabled"}></label>
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
      settingsForm.elements.analytics.checked = analyticsConfigured && allowsAnalytics(saved);
      settingsForm.elements.marketing.checked = marketingConfigured && saved?.version === cfg.cookies.policyVersion && saved.marketing === true && !gpcEnabled;
      dialog.returnValue = "";
      dialog.showModal();
    };
    $("[data-cookie-essential]", root).addEventListener("click", () => { writeConsent({ analytics: false, marketing: false }); banner.hidden = true; });
    $("[data-cookie-all]", root).addEventListener("click", () => { writeConsent({ analytics: analyticsConfigured && !gpcEnabled, marketing: false }); banner.hidden = true; });
    $("[data-cookie-settings]", root).addEventListener("click", openSettings);
    $("[data-cookie-dialog-essential]", root).addEventListener("click", () => { writeConsent({ analytics: false, marketing: false }); dialog.close(); banner.hidden = true; });
    dialog.addEventListener("close", () => {
      if (dialog.returnValue === "save") {
        writeConsent({ analytics: analyticsConfigured && settingsForm.elements.analytics.checked && !gpcEnabled, marketing: marketingConfigured && settingsForm.elements.marketing.checked && !gpcEnabled });
        banner.hidden = true;
      }
    });
    $$('[data-cookie-settings-link]').forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); openSettings(); }));
    if (current?.version === cfg.cookies.policyVersion) {
      banner.hidden = true;
      activateConsentFeatures(gpcEnabled ? { ...current, analytics: false, marketing: false } : current);
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
      result.innerHTML = `<strong>Следующий шаг — персональный расчёт.</strong><p>${basisText} ${visitText}</p><a class="button" href="${withAttribution("/calculator/")}">Перейти к калькулятору</a>`;
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

  function initCarExamples() {
    const targets = $$("[data-car-examples]");
    const source = window.BELUCHET_CAR_EXAMPLES;
    if (!targets.length || !Array.isArray(source?.items)) return;

    const segmentFilter = $("[data-example-segment]");
    const budgetFilter = $("[data-example-budget]");
    const searchFilter = $("[data-example-search]");
    const countNode = $("[data-example-count]");
    const updatedNode = $("[data-examples-updated]");
    if (updatedNode && source.updatedAt) {
      updatedNode.textContent = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${source.updatedAt}T00:00:00Z`));
    }

    const calculationLink = (item) => {
      const params = new URLSearchParams({ power: String(item.power), price: String(item.priceUsd), package: item.package });
      return withAttribution(`/calculator/?${params}`);
    };

    const cardMarkup = (item) => {
      const serviceRub = cfg.pricingRub.scenarioPackages.rvp[item.package] + complexityPriceRub(item.priceUsd, item.power);
      const vehicleDetails = item.engineType === "ev"
        ? `${item.engineLabel}, ${number(item.power)} л.с.`
        : `${item.engineLabel}, ${number(item.power)} л.с., ${number(item.volume)} см³`;

      return `<article class="card car-example-card" data-example-id="${item.id}">
        <div class="car-example-head">
          <div><span class="tag">${item.segmentLabel}</span><h3>${item.title}</h3><p>${item.year} · ${vehicleDetails}</p></div>
        </div>
        <div class="example-economics"><div><span>Ориентир стоимости сопровождения</span><strong>от ${money(serviceRub, "RUB")}</strong><small>${packageLabels[item.package]} · цена услуг, без внешних расходов</small></div></div>
        <div class="example-actions"><a class="button" href="${calculationLink(item)}">Уточнить стоимость</a><a class="button secondary" href="${withAttribution(`/contacts/?car=${encodeURIComponent(`${item.title} ${item.year}`)}`)}">Проверить объявление</a></div>
      </article>`;
    };

    const renderCarExamples = () => {
      const segment = segmentFilter?.value || "all";
      const maxBudget = Number(budgetFilter?.value || 0);
      const query = String(searchFilter?.value || "").trim().toLowerCase();
      const filtered = source.items.filter((item) => {
        const matchesSegment = segment === "all" || item.segment === segment;
        const matchesBudget = !maxBudget || item.priceUsd * state.rates.USD_RUB <= maxBudget;
        const matchesQuery = !query || `${item.title} ${item.engineLabel} ${item.segmentLabel}`.toLowerCase().includes(query);
        return matchesSegment && matchesBudget && matchesQuery;
      });

      targets.forEach((target) => {
        const featuredOnly = target.dataset.featuredOnly === "true";
        const limit = Math.max(1, Number(target.dataset.featureLimit || 3));
        const items = featuredOnly ? source.items.filter((item) => item.featured).slice(0, limit) : filtered;
        target.innerHTML = items.map(cardMarkup).join("");
        const empty = target.parentElement?.querySelector("[data-examples-empty]");
        if (empty) empty.hidden = items.length > 0;
      });
      if (countNode) countNode.textContent = `${filtered.length} из ${source.items.length}`;
    };

    [segmentFilter, budgetFilter, searchFilter].filter(Boolean).forEach((control) => {
      control.addEventListener(control === searchFilter ? "input" : "change", renderCarExamples);
    });
    renderCarExamples();
  }

  setConfigText();
  $$("[data-telegram-link]").forEach((link) => { link.href = cfg.brand.telegram; });
  initLegalDetails();
  initNavigation();
  initAttribution();
  initCalculator();
  initFaqModes();
  initLeadForm();
  initMetrika();
  initCookieConsent();
  initBasisCheck();
  initRealCases();
  initCarExamples();
})();
