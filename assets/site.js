(function () {
  "use strict";

  const cfg = window.BELUCHET_CONFIG;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const state = { rates: { ...cfg.rates.fallback } };
  let renderCarExamples = null;

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

  function yearsLabel(value) {
    if (value === 1) return "1 год";
    if (value >= 2 && value <= 4) return `${value} года`;
    return `${value} лет`;
  }

  function renderPriceReferences() {
    $$(".price, .price-rail .rail-item strong, .term-table td, .tariff-choice b").forEach((node) => {
      if (!node.dataset.priceUsd) {
        const source = node.textContent.trim();
        const match = source.match(/\$\s*([\d\s]+)/);
        if (!match) return;
        node.dataset.priceUsd = match[1].replace(/\s/g, "");
        node.dataset.priceAnnual = String(/\/год/.test(source));
      }
      const rubles = Number(node.dataset.priceUsd) * state.rates.USD_RUB;
      let reference = $(".price-rub-reference", node);
      if (!reference) {
        reference = document.createElement("small");
        reference.className = "price-rub-reference";
        node.appendChild(reference);
      }
      reference.textContent = `≈ ${money(rubles, "RUB")}${node.dataset.priceAnnual === "true" ? "/год" : ""}`;
    });
  }

  async function initPriceReferences() {
    if (!$(".price, .price-rail .rail-item strong, .term-table td, .tariff-choice b, [data-car-examples]")) return;
    renderPriceReferences();
    if ($("#calculator-form")) return;
    try {
      const response = await fetch(apiUrl("/api/v1/rates"), { cache: "no-store" });
      const data = await response.json();
      if (response.ok && data?.rates?.USD_RUB) {
        state.rates = { ...state.rates, ...data.rates };
        renderPriceReferences();
        renderCarExamples?.();
      }
    } catch (error) {
      // The visible ruble reference remains based on the dated fallback rate.
    }
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
    return [operator.fullName, operator.inn, operator.registrationNumber, operator.address].every((value) => String(value || "").trim());
  }

  function initLegalDetails() {
    const operator = cfg.legal?.operator || {};
    const operatorReady = operatorDetailsReady();
    $$('[data-operator-name]').forEach((node) => {
      node.textContent = operator.fullName || cfg.brand.company;
    });
    $$('[data-operator-details]').forEach((node) => {
      node.hidden = !operatorReady;
    });
    $$('[data-operator-missing]').forEach((node) => {
      node.hidden = operatorReady;
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

  async function loadRates() {
    const status = $("[data-rate-status]");
    try {
      const apiResponse = await fetch(apiUrl("/api/v1/rates"), { cache: "no-store" });
      const apiData = await apiResponse.json();
      if (apiResponse.ok && apiData?.rates) {
        state.rates = { ...state.rates, ...apiData.rates };
        if (status) status.textContent = apiData.source === "CBR" ? "Валютный пересчёт обновлён по курсу ЦБ РФ." : "Для валютного пересчёта используется резервный курс. Итог подтвердит менеджер.";
        renderPriceReferences();
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
      renderPriceReferences();
      if (status) status.textContent = "Валютный пересчёт обновлён по курсу ЦБ РФ.";
    } catch (error) {
      if (status) status.textContent = "Для валютного пересчёта используется резервный курс. Итог подтвердит менеджер.";
    }
    calculate();
  }

  function bandIndex(value, bands) {
    const index = bands.findIndex((maxValue) => value <= maxValue);
    return index === -1 ? bands.length : index;
  }

  function annualBelarusTax(maxMassKg, comfortVehicle) {
    const rules = cfg.calculator.annualTaxes.belarus;
    const band = rules.passengerCarRatesByn.find((item) => maxMassKg <= item.maxMassKg)
      || rules.passengerCarRatesByn[rules.passengerCarRatesByn.length - 1];
    const multiplier = comfortVehicle ? rules.comfortMultiplier : 1;
    return { annualByn: band.annualByn * multiplier, multiplier };
  }

  function scenarioCosts(form) {
    const packageType = form.elements.package.value;
    const labels = {
      self: "Самостоятельный",
      assisted: "С сопровождением",
      full: "Полный цикл"
    };
    return {
      base: cfg.pricingUsd.scenarioPackages.rvp[packageType],
      label: `${labels[packageType]} · РВП 1 год`
    };
  }

  function complexityPrice(carPriceUsd, power) {
    const rules = cfg.pricingUsd.complexity;
    if (carPriceUsd > rules.specialPriceUsd || power > rules.specialPowerHp) return rules.special;
    if (carPriceUsd > rules.premiumPriceUsd || power > rules.premiumPowerHp) return rules.premium;
    return 0;
  }

  function rfUtilCostFromValues({ age, engineType, power, volume, calculationYear }) {
    const rules = cfg.calculator.rfUtil;
    const normalizedAge = age === "under3" ? "under3" : "over3";
    const normalizedPower = Math.max(0, Number(power || 0));
    const normalizedVolume = Math.max(0, Number(volume || 0));

    let coefficient;
    if (engineType === "ev") {
      coefficient = rules.evCommercialCoefficients[normalizedAge][bandIndex(normalizedPower, rules.evPowerBandsHp)];
    } else {
      const volumeRow = rules.iceCommercialCoefficients.find((row) => normalizedVolume <= row.maxVolume)
        || rules.iceCommercialCoefficients[rules.iceCommercialCoefficients.length - 1];
      coefficient = volumeRow[normalizedAge][bandIndex(normalizedPower, rules.powerBandsHp)];
    }

    const normalizedYear = Number(calculationYear || 2026);
    if (normalizedYear < rules.coefficientBaseYear) {
      coefficient = Math.round((coefficient / 1.1) * 100) / 100;
    }

    return {
      coefficient,
      amountRub: Math.round(coefficient * rules.baseRateRub),
      age: normalizedAge,
      calculationYear: normalizedYear
    };
  }

  function rfUtilCost(form) {
    return rfUtilCostFromValues({
      age: form.elements.age.value,
      engineType: form.elements.engineType.value,
      power: form.elements.power.value,
      volume: form.elements.volume.value,
      calculationYear: form.elements.calculationYear?.value
    });
  }

  function medianRfTaxRate(power) {
    const bands = cfg.calculator.annualTaxes.rf.medianRateBandsRub;
    const band = bands.find((item) => power <= item.maxPowerHp) || bands[bands.length - 1];
    return band.ratePerHpRub;
  }

  function calculate() {
    const form = $("#calculator-form");
    if (!form) return;

    const carPriceUsd = Math.max(0, Number(form.elements.price.value || 0));
    const volume = Number(form.elements.volume.value || 0);
    const power = Number(form.elements.power.value || 0);
    const basis = scenarioCosts(form);
    const complexity = complexityPrice(carPriceUsd, power);
    const packageType = form.elements.package.value;
    const gai = form.elements.gai?.checked && packageType === "self" ? cfg.pricingUsd.gaiHelp : 0;
    const annual = form.elements.annual?.checked ? cfg.pricingUsd.annualControl : 0;
    const optionalExtras = gai + annual;
    const extras = complexity + optionalExtras;
    const scenarioUsd = basis.base + extras;
    const scenarioRub = scenarioUsd * state.rates.USD_RUB;
    const rfUtil = rfUtilCost(form);
    const benefitRub = rfUtil.amountRub - scenarioRub;
    const rfTaxRate = medianRfTaxRate(power);
    const comparisonYears = Math.max(1, Number(form.elements.comparisonYears?.value || 1));
    const maxMassKg = Math.max(1, Number(form.elements.maxMassKg?.value || cfg.calculator.annualTaxes.belarus.defaultMassKg));
    const comfortVehicle = carPriceUsd > cfg.calculator.annualTaxes.belarus.comfortPriceThresholdUsd;
    const rfAnnualTaxRub = Math.round(power * rfTaxRate);
    const byAnnualTax = annualBelarusTax(maxMassKg, comfortVehicle);
    const byAnnualTaxRub = Math.round(byAnnualTax.annualByn * state.rates.BYN_RUB);
    const annualSavingRub = rfAnnualTaxRub - byAnnualTaxRub;
    const annualPeriodSavingRub = annualSavingRub * comparisonYears;
    const totalBenefitRub = benefitRub + annualPeriodSavingRub;
    const engineType = form.elements.engineType.value;
    const ageLabel = form.elements.age.value === "under3" ? "до 3 лет" : "старше 3 лет";
    const engineLabel = engineType === "ev" ? "электро / последовательный гибрид" : "ДВС / иной гибрид";

    const values = {
      "[data-out-total-benefit]": money(totalBenefitRub, "RUB"),
      "[data-out-benefit]": money(benefitRub, "RUB"),
      "[data-out-util-rf]": money(rfUtil.amountRub, "RUB"),
      "[data-out-formula]": `коэффициент ${String(rfUtil.coefficient).replace(".", ",")} × ${money(cfg.calculator.rfUtil.baseRateRub, "RUB")}`,
      "[data-out-scenario]": money(scenarioUsd),
      "[data-out-scenario-rub]": money(scenarioRub, "RUB"),
      "[data-out-base]": money(basis.base),
      "[data-out-extras]": money(optionalExtras),
      "[data-out-basis]": basis.label,
      "[data-out-vehicle]": engineType === "ev" ? `${engineLabel}, ${number(power)} л.с., ${ageLabel}` : `${number(volume)} см³, ${number(power)} л.с., ${ageLabel}`,
      "[data-out-rate-kind]": "обычный коэффициент",
      "[data-out-rf-annual-tax]": `${money(rfAnnualTaxRub, "RUB")}/год`,
      "[data-out-by-annual-tax-rub]": `${money(byAnnualTaxRub, "RUB")}/год`,
      "[data-out-by-annual-tax-byn]": `${money(byAnnualTax.annualByn, "BYN")}/год`,
      "[data-out-annual-saving]": money(annualSavingRub, "RUB"),
      "[data-out-annual-period-saving]": money(annualPeriodSavingRub, "RUB"),
      "[data-out-comparison-period]": yearsLabel(comparisonYears),
      "[data-out-max-mass]": `масса ${number(maxMassKg)} кг${byAnnualTax.multiplier > 1 ? `, коэффициент ×${byAnnualTax.multiplier}` : ""}`,
      "[data-out-comfort]": comfortVehicle ? "повышенная комфортность по порогу цены" : "обычная категория по порогу цены",
      "[data-out-rf-tax-formula]": `${number(power)} л.с. × ${money(rfTaxRate, "RUB")}/л.с. (медианная модель)`
    };
    Object.entries(values).forEach(([selector, value]) => {
      $$(selector).forEach((node) => {
        node.textContent = value;
      });
    });
    $$('[data-out-benefit]').forEach((node) => node.classList.toggle("negative", benefitRub < 0));
    const totalBenefitNode = $("[data-out-total-benefit]");
    totalBenefitNode?.classList.toggle("negative", totalBenefitRub < 0);
    $$('[data-out-annual-saving], [data-out-annual-period-saving]').forEach((node) => {
      node.classList.toggle("negative", annualSavingRub < 0);
    });
    const totalBenefitLabel = $("[data-total-benefit-label]");
    if (totalBenefitLabel) totalBenefitLabel.textContent = totalBenefitRub >= 0 ? "Итоговая потенциальная выгода" : "Итоговая разница по выбранным условиям";
    const benefitLabel = $("[data-benefit-label]");
    if (benefitLabel) benefitLabel.textContent = benefitRub >= 0 ? "Потенциальная выгода после выбранного тарифа" : "Разница после выбранного тарифа";
    const complexityRow = $("[data-complexity-row]");
    if (complexityRow) complexityRow.classList.toggle("hidden", complexity === 0);
    const complexityNode = $("[data-out-complexity]");
    if (complexityNode) complexityNode.textContent = money(complexity);
    const volumeField = $("[data-volume-field]");
    if (volumeField) volumeField.classList.toggle("hidden", engineType === "ev");
    const massSummary = $("[data-mass-summary]");
    if (massSummary) massSummary.textContent = `${number(maxMassKg)} кг`;
    const extrasSummary = $("[data-extras-summary]");
    if (extrasSummary) {
      const selectedExtras = [form.elements.gai?.checked, form.elements.annual?.checked].filter(Boolean).length;
      extrasSummary.textContent = selectedExtras ? `выбрано: ${selectedExtras}` : "не выбраны";
    }

    const contactLink = $("[data-calculator-contact]");
    if (contactLink) {
      const params = new URLSearchParams({
        car: engineType === "ev" ? `${engineLabel}, ${power} л.с.` : `${volume} см³, ${power} л.с.`,
        budget: carPriceUsd ? `${number(carPriceUsd)} USD` : "",
        package: packageType,
        basis: form.elements.basis.value === "vng-realestate" ? "vng" : form.elements.basis.value,
        calculation: `${engineLabel}; ${ageLabel}; цена ${money(carPriceUsd)}; ориентир утильсбора РФ для ${rfUtil.calculationYear} года: ${money(rfUtil.amountRub, "RUB")}; тариф ${basis.label}: ${money(scenarioUsd)}; разовая выгода после тарифа: ${money(benefitRub, "RUB")}; транспортный налог РФ по медианной ставке ${money(rfTaxRate, "RUB")}/л.с.: ${money(rfAnnualTaxRub, "RUB")}/год; транспортный налог РБ при массе ${number(maxMassKg)} кг (${comfortVehicle ? "повышенная комфортность по порогу цены" : "обычная категория"}): ${money(byAnnualTaxRub, "RUB")}/год; итоговая потенциальная выгода за ${yearsLabel(comparisonYears)}: ${money(totalBenefitRub, "RUB")}.`
      });
      contactLink.href = `/contacts/?${params.toString()}`;
    }
  }

  function initCalculator() {
    const form = $("#calculator-form");
    if (!form) return;
    const params = new URLSearchParams(window.location.search);
    const requestedPackage = params.get("package");
    if (["self", "assisted", "full"].includes(requestedPackage)) {
      form.elements.package.value = requestedPackage;
    }
    const allowedSelectValues = {
      engineType: ["ice", "ev"],
      age: ["under3", "over3"],
      calculationYear: cfg.calculator.rfUtil.supportedYears.map(String),
      comparisonYears: ["1", "3", "5"]
    };
    Object.entries(allowedSelectValues).forEach(([name, values]) => {
      const value = params.get(name);
      if (value && values.includes(value) && form.elements[name]) form.elements[name].value = value;
    });
    const numericLimits = {
      volume: [1, 10000],
      power: [1, 2000],
      price: [0, 10000000],
      maxMassKg: [1, 100000]
    };
    Object.entries(numericLimits).forEach(([name, [min, max]]) => {
      const value = Number(params.get(name));
      if (Number.isFinite(value) && value >= min && value <= max && form.elements[name]) form.elements[name].value = String(value);
    });
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
    form.elements.consent?.addEventListener("change", () => form.elements.consent.setCustomValidity(""));
    const params = new URLSearchParams(window.location.search);
    for (const name of ["car", "budget", "package", "basis"]) {
      if (params.get(name) && form.elements[name]) form.elements[name].value = params.get(name);
    }
    if (params.get("calculation") && form.elements.comment && !form.elements.comment.value) {
      form.elements.comment.value = `Предварительный расчёт: ${params.get("calculation")}`;
    }
    if (!operatorDetailsReady()) {
      const submit = form.querySelector('[type="submit"]');
      if (submit) {
        submit.disabled = true;
        submit.textContent = "Приём заявок временно приостановлен";
      }
      form.insertAdjacentHTML("afterbegin", '<div class="notice" data-operator-form-warning><strong>Форма пока недоступна.</strong> Владелец сайта должен опубликовать полные реквизиты оператора персональных данных.</div>');
      return;
    }
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      if (data.get("website")) return;
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
        calculation_version: `${cfg.calculator.rfUtil.version}+annual-${cfg.calculator.annualTaxes.version}`,
        consent_given: data.get("consent") === "yes",
        consent_version: cfg.legal.personalDataConsentVersion,
        privacy_policy_version: cfg.legal.privacyPolicyVersion,
        consent_timestamp: new Date().toISOString(),
        consent_source: `${window.location.origin}${window.location.pathname}`,
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
        `Ссылка: ${data.get("listing_url") || "не указана"}`,
        `Бюджет: ${payload.budget || "не указан"}`,
        `Комментарий: ${payload.comment || "нет"}`,
        `Согласие на обработку ПДн: версия ${payload.consent_version}, ${payload.consent_timestamp}`
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

  function deleteOptionalCookies(prefixes) {
    document.cookie.split(";").forEach((item) => {
      const name = item.split("=")[0].trim();
      if (prefixes.some((prefix) => name.startsWith(prefix))) {
        document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
        document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.${location.hostname}; SameSite=Lax`;
      }
    });
  }

  function activateConsentFeatures(consent) {
    if (!consent || consent.version !== cfg.cookies.policyVersion) return;
    if (!consent.analytics) deleteOptionalCookies(["_ga", "_gid", "_gat", "_ym_", "yandexuid", "yabs-sid"]);
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
      if (!$('[data-cookie-settings-link]', documentsColumn)) documentsColumn.insertAdjacentHTML("beforeend", '<p><a href="#" data-cookie-settings-link>Настройки cookie</a></p>');
    }
    const current = readConsent();
    const gpcEnabled = navigator.globalPrivacyControl === true;
    const analyticsConfigured = Boolean(cfg.analytics?.yandexMetrikaId);
    const marketingConfigured = Array.isArray(cfg.analytics?.marketingScripts) && cfg.analytics.marketingScripts.length > 0;
    const optionalConfigured = analyticsConfigured || marketingConfigured;
    const root = document.createElement("div");
    root.innerHTML = `
      <section class="cookie-banner" data-cookie-banner role="dialog" aria-label="Настройки cookie">
        <div><strong>Настройки cookie</strong><p>${optionalConfigured ? "Необходимые cookie обеспечивают работу сайта. Аналитику и маркетинговые технологии включаем только с вашего согласия." : "Сейчас сайт использует только необходимый cookie для сохранения вашего выбора. Аналитика и рекламные технологии не подключены."}</p></div>
        <div class="cookie-actions">
          <button class="button secondary small-button" type="button" data-cookie-essential>${optionalConfigured ? "Только необходимые" : "Понятно"}</button>
          <button class="button secondary small-button" type="button" data-cookie-settings ${optionalConfigured ? "" : "hidden"}>Настроить</button>
          <button class="button small-button" type="button" data-cookie-all ${optionalConfigured ? "" : "hidden"}>Принять все</button>
        </div>
      </section>
      <dialog class="cookie-dialog" data-cookie-dialog aria-labelledby="cookie-title">
        <form method="dialog" class="cookie-dialog-card">
          <div class="modal-head"><div><div class="eyebrow">Конфиденциальность</div><h2 id="cookie-title">Настройки cookie</h2></div><button class="icon-button" value="cancel" aria-label="Закрыть">×</button></div>
          <div class="cookie-options">
            <label class="cookie-option"><span><strong>Необходимые</strong><small>Выбор настроек и техническая работа интерфейса.</small></span><input type="checkbox" checked disabled></label>
            <label class="cookie-option"><span><strong>Аналитические</strong><small>${analyticsConfigured ? "Помогают понять, какие страницы и функции полезны." : "Не подключены."}</small></span><input name="analytics" type="checkbox" ${analyticsConfigured ? "" : "disabled"}></label>
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
      settingsForm.elements.analytics.checked = Boolean(saved?.analytics) && !gpcEnabled;
      settingsForm.elements.marketing.checked = Boolean(saved?.marketing) && !gpcEnabled;
      dialog.showModal();
    };
    $("[data-cookie-essential]", root).addEventListener("click", () => { writeConsent({ analytics: false, marketing: false }); banner.hidden = true; });
    $("[data-cookie-all]", root).addEventListener("click", () => { writeConsent({ analytics: analyticsConfigured && !gpcEnabled, marketing: marketingConfigured && !gpcEnabled }); banner.hidden = true; });
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

  function initCarExamples() {
    const targets = $$("[data-car-examples]");
    const source = window.BELUCHET_CAR_EXAMPLES;
    if (!targets.length || !Array.isArray(source?.items)) return;

    const packageLabels = {
      self: "Самостоятельный",
      assisted: "С сопровождением",
      full: "Полный цикл"
    };
    const segmentFilter = $("[data-example-segment]");
    const budgetFilter = $("[data-example-budget]");
    const searchFilter = $("[data-example-search]");
    const countNode = $("[data-example-count]");
    const updatedNode = $("[data-examples-updated]");
    if (updatedNode && source.updatedAt) {
      updatedNode.textContent = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${source.updatedAt}T00:00:00Z`));
    }

    const calculationLink = (item) => {
      const params = new URLSearchParams({
        engineType: item.engineType,
        age: item.age,
        volume: String(Math.max(1, item.volume || 1)),
        power: String(item.power),
        price: String(item.priceUsd),
        calculationYear: String(source.calculationYear || 2026),
        comparisonYears: "3",
        package: item.package
      });
      return `/calculator/?${params.toString()}`;
    };

    const cardMarkup = (item) => {
      const baseUsd = cfg.pricingUsd.scenarioPackages.rvp[item.package];
      const serviceUsd = baseUsd + complexityPrice(item.priceUsd, item.power);
      const serviceRub = Math.round(serviceUsd * state.rates.USD_RUB);
      const vehiclePriceRub = Math.round(item.priceUsd * state.rates.USD_RUB);
      const minimumBudgetUsd = item.priceUsd + serviceUsd;
      const minimumBudgetRub = Math.round(minimumBudgetUsd * state.rates.USD_RUB);
      const rfUtil = rfUtilCostFromValues({
        age: item.age,
        engineType: item.engineType,
        power: item.power,
        volume: item.volume,
        calculationYear: source.calculationYear
      });
      const differenceRub = rfUtil.amountRub - serviceRub;
      const hasBenefit = differenceRub >= 0;
      const vehicleDetails = item.engineType === "ev"
        ? `${item.engineLabel}, ${number(item.power)} л.с.`
        : `${item.engineLabel}, ${number(item.power)} л.с., ${number(item.volume)} см³`;

      return `<article class="card car-example-card" data-example-id="${item.id}">
        <div class="car-example-benefit ${hasBenefit ? "" : "negative"}">
          <span>${hasBenefit ? "Возможная выгода до" : "Выгода по этому расчёту"}</span>
          <strong>${money(Math.max(0, differenceRub), "RUB")}</strong>
          <small>${hasBenefit ? "после стоимости сопровождения" : "расходы нужно уточнить индивидуально"}</small>
        </div>
        <div class="car-example-head">
          <div><span class="tag">${item.segmentLabel}</span><h3>${item.title}</h3><p>${item.year} · ${vehicleDetails}</p></div>
          <div class="car-example-price-block"><span>Ориентир цены авто</span><strong class="car-example-price">${money(vehiclePriceRub, "RUB")}</strong><small>≈ ${money(item.priceUsd)}</small></div>
        </div>
        <div class="example-economics">
          <div><span>Сопровождение и проверка</span><strong>${money(serviceRub, "RUB")}</strong><small>≈ ${money(serviceUsd)} · ${packageLabels[item.package]}</small></div>
          <div><span>Автомобиль с сопровождением</span><strong>${money(minimumBudgetRub, "RUB")}</strong><small>≈ ${money(minimumBudgetUsd)} · без внешних расходов</small></div>
          <div class="example-comparison"><span>Расчётный утильсбор в РФ</span><strong>${money(rfUtil.amountRub, "RUB")}</strong><small>для сравнения · ${source.calculationYear} год</small></div>
        </div>
        <div class="example-actions"><a class="button" href="${calculationLink(item)}">Уточнить расчёт</a><a class="button secondary" href="/contacts/?car=${encodeURIComponent(`${item.title} ${item.year}`)}">Проверить объявление</a></div>
      </article>`;
    };

    renderCarExamples = () => {
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
  initLegalDetails();
  initPriceReferences();
  initNavigation();
  initCalculator();
  initFaqModes();
  initLeadForm();
  initCookieConsent();
  initBasisCheck();
  initRealCases();
  initCarExamples();
})();
