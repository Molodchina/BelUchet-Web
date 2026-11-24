window.BELUCHET_CONFIG = {
  brand: {
    name: "БелУчёт",
    domain: "beluchet.ru",
    email: "request@beluchet.ru",
    phone: "После проверки заявки",
    telegram: "https://t.me/beluchet",
    city: "Минск и Минская область",
    company: "БелУчёт",
    privacyEmail: "privacy@beluchet.ru",
    apiBaseUrl: window.BELUCHET_API_BASE_URL || (["127.0.0.1", "localhost"].includes(window.location.hostname) ? "http://127.0.0.1:8091" : "https://api.beluchet.ru")
  },
  legal: {
    privacyPolicyVersion: "2026-10-04",
    personalDataConsentVersion: "2026-08-27",
    disclaimerVersion: "2026-08-27",
    personalDataRegistrationReady: true,
    operator: {
      type: "npd",
      fullName: "Митрофанова Светлана Ивановна",
      inn: "504501379133",
      registrationNumber: "",
      address: "Российская Федерация, г. Москва, 2-й проезд Марьиной Рощи, д. 17, кв. 2",
      npdRegistrationDate: "12.08.2026",
      npdCertificateNumber: "116453239",
      npdCertificateDate: "20.08.2026",
      workingHours: "Пн–Пт, 10:00–18:00 (МСК)"
    }
  },
  cookies: {
    policyVersion: "2026-08-27",
    consentName: "beluchet_cookie_consent_v1",
    maxAgeDays: 180
  },
  analytics: {
    // Activate only after the provider disclosure and a new cookie policy version are published.
    yandexMetrikaId: "",
    metrikaConsentPolicyVersion: "",
    marketingScripts: []
  },
  rates: {
    updatedAt: "2026-08-27",
    fallback: {
      USD_RUB: 80,
      EUR_RUB: 100,
      BYN_RUB: 28
    }
  },
  pricingRub: {
    conversionBasis: {
      sourceCurrency: "USD",
      rubPerUsd: 80,
      fixedAt: "2026-08-27"
    },
    scenarioPackages: {
      rvp: {
        self: 295200,
        assisted: 367200,
        full: 471200
      },
      vng: {
        self: 383200,
        assisted: 503200,
        full: 623200
      },
      vngRealEstate: {
        self: 519200,
        assisted: 639200,
        full: 759200
      }
    },
    rvpExtraYear: 40000,
    complexity: {
      premium: 23200,
      special: 55200,
      premiumPriceUsd: 80000,
      specialPriceUsd: 150000,
      premiumPowerHp: 250,
      specialPowerHp: 400
    },
    gaiHelp: 47200,
    annualControl: 23200,
    statusSupportYear: 384000
  },
  calculator: {
    serviceEstimateVersion: "service-estimate-v1"
  }
};
