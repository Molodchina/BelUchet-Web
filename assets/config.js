window.BELUCHET_CONFIG = {
  brand: {
    name: "БелУчёт",
    domain: "beluchet.ru",
    email: "request@beluchet.ru",
    phone: "После проверки заявки",
    telegram: "В ответном сообщении",
    city: "Минск и Минская область",
    company: "БелУчёт",
    privacyEmail: "privacy@beluchet.ru",
    apiBaseUrl: window.BELUCHET_API_BASE_URL || (["127.0.0.1", "localhost"].includes(window.location.hostname) ? "http://127.0.0.1:8091" : "")
  },
  cookies: {
    policyVersion: "2026-08-10",
    consentName: "beluchet_cookie_consent_v1",
    maxAgeDays: 180
  },
  analytics: {
    yandexMetrikaId: "",
    marketingScripts: []
  },
  rates: {
    updatedAt: "2026-08-09",
    fallback: {
      USD_RUB: 92,
      EUR_RUB: 100,
      BYN_RUB: 28
    }
  },
  pricingUsd: {
    scenarioPackages: {
      rvp: {
        self: 3690,
        assisted: 4590,
        full: 5890
      },
      vng: {
        self: 4790,
        assisted: 6290,
        full: 7790
      },
      vngRealEstate: {
        self: 6490,
        assisted: 7990,
        full: 9490
      }
    },
    rvpExtraYear: 500,
    complexity: {
      premium: 290,
      special: 690,
      premiumPriceUsd: 80000,
      specialPriceUsd: 150000,
      premiumPowerHp: 250,
      specialPowerHp: 400
    },
    gaiHelp: 590,
    annualControl: 290,
    statusSupportYear: 4800
  },
  calculator: {
    annualTaxes: {
      version: "2026-01-01",
      rf: {
        defaultRatePerHpRub: 150,
        sourceUrl: "https://www.nalog.gov.ru/rn77/taxation/taxes/tr_ul/",
        calculatorUrl: "https://www.nalog.gov.ru/rn77/service/calc_transport/"
      },
      belarus: {
        sourceUrl: "https://nalog.gov.by/individuals/property_taxation/taxation_of_vehicles/9955/",
        comfortMultiplier: 10,
        passengerCarRatesByn: [
          { maxMassKg: 1500, annualByn: 75 },
          { maxMassKg: 1750, annualByn: 99 },
          { maxMassKg: 2000, annualByn: 124 },
          { maxMassKg: 2250, annualByn: 148 },
          { maxMassKg: 2500, annualByn: 177 },
          { maxMassKg: 3000, annualByn: 196 },
          { maxMassKg: 999999, annualByn: 270 }
        ]
      }
    },
    rfUtil: {
      version: "2026-08-10",
      effectiveFrom: "2026-01-01",
      coefficientBaseYear: 2027,
      supportedYears: [2026, 2027],
      baseRateRub: 20000,
      sourceUrl: "https://government.ru/docs/all/161708/",
      consolidatedSourceUrl: "https://www.consultant.ru/document/cons_doc_LAW_156832/7d2b30cbf7a938c7edc50c48b7c2474e0143d764/",
      powerBandsHp: [70, 100, 130, 160, 190, 220, 250, 280, 310, 340, 370, 400, 430, 460, 500],
      iceCommercialCoefficients: [
        { maxVolume: 1000, under3: [16.37, 16.37, 16.37, 16.37, 16.90, 17.42, 17.82, 19.01, 19.01, 19.01, 19.01, 19.01, 19.01, 19.01, 19.01, 19.01], over3: [30.36, 30.36, 30.36, 30.36, 31.27, 32.21, 33.13, 33.13, 33.13, 33.13, 33.13, 33.13, 33.13, 33.13, 33.13, 33.13] },
        { maxVolume: 2000, under3: [44.04, 44.04, 44.04, 44.04, 49.50, 52.40, 55.57, 62.83, 71.02, 80.26, 91.48, 104.28, 118.80, 135.56, 154.44, 176.09], over3: [77.48, 77.48, 77.48, 77.48, 82.10, 87.12, 92.27, 101.11, 110.62, 121.18, 132.66, 145.20, 159.06, 174.24, 190.74, 208.82] },
        { maxVolume: 3000, under3: [123.78, 123.78, 123.78, 123.78, 126.87, 130.02, 132.13, 138.60, 144.14, 149.95, 155.89, 162.23, 168.70, 175.43, 182.42, 189.68], over3: [187.40, 187.40, 187.40, 187.40, 190.08, 192.59, 195.36, 201.30, 207.37, 213.05, 218.99, 225.19, 231.53, 238.00, 244.60, 251.46] },
        { maxVolume: 3500, under3: [142.12, 142.12, 142.12, 142.12, 144.94, 147.84, 150.88, 154.57, 158.40, 167.11, 176.35, 186.12, 196.28, 207.11, 218.46, 230.47], over3: [217.59, 217.59, 217.59, 217.59, 220.04, 222.42, 224.80, 227.96, 233.64, 239.58, 246.71, 254.10, 261.76, 269.54, 277.73, 286.04] },
        { maxVolume: 99999, under3: [180.99, 180.99, 180.99, 180.99, 184.01, 187.18, 190.34, 194.17, 198.00, 205.00, 212.16, 219.65, 227.30, 235.22, 243.41, 251.99], over3: [237.92, 237.92, 237.92, 237.92, 241.43, 245.12, 248.82, 254.50, 260.30, 274.56, 289.74, 305.71, 322.48, 340.30, 359.04, 378.71] }
      ],
      evPowerBandsHp: [80, 100, 130, 160, 190, 220, 250, 280],
      evCommercialCoefficients: {
        under3: [44.05, 54.52, 72.47, 85.80, 101.64, 120.65, 142.96, 169.36, 200.64],
        over3: [77.48, 90.29, 105.20, 122.50, 142.69, 166.32, 193.78, 225.72, 262.94]
      },
      personalUse: {
        under3: 0.17,
        over3: 0.26,
        iceMaxVolume: 3000,
        iceMaxPowerHp: 160,
        evMaxPowerHp: 80
      }
    }
  }
};
