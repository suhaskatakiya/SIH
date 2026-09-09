/**
 * CropSaathi Commodity Catalog & MSP Rates.
 * Real Government of India Minimum Support Prices (MSP) in INR per quintal.
 */

export interface CommodityItem {
  code: string;
  nameEn: string;
  nameHi: string;
  categoryEn: string;
  categoryHi: string;
  icon: string;
  ratePerQtl: string;
}

export const COMMODITIES: CommodityItem[] = [
  // Cereals & Millets
  {
    code: 'PADDY_COMMON',
    nameEn: 'Paddy (Common)',
    nameHi: 'धान (सामान्य)',
    categoryEn: 'Cereals & Millets',
    categoryHi: 'अनाज और कदन',
    icon: '🌾',
    ratePerQtl: '2441.00'
  },
  {
    code: 'PADDY_GRADE_A',
    nameEn: 'Paddy (Grade A)',
    nameHi: 'धान (ग्रेड ए)',
    categoryEn: 'Cereals & Millets',
    categoryHi: 'अनाज और कदन',
    icon: '🌾',
    ratePerQtl: '2489.00'
  },
  {
    code: 'WHEAT',
    nameEn: 'Wheat',
    nameHi: 'गेहूँ',
    categoryEn: 'Cereals & Millets',
    categoryHi: 'अनाज और कदन',
    icon: '🌾',
    ratePerQtl: '2425.00'
  },
  {
    code: 'MAIZE',
    nameEn: 'Maize (Corn)',
    nameHi: 'मक्का',
    categoryEn: 'Cereals & Millets',
    categoryHi: 'अनाज और कदन',
    icon: '🌽',
    ratePerQtl: '2225.00'
  },
  {
    code: 'BARLEY',
    nameEn: 'Barley',
    nameHi: 'जौ',
    categoryEn: 'Cereals & Millets',
    categoryHi: 'अनाज और कदन',
    icon: '🌾',
    ratePerQtl: '1850.00'
  },
  {
    code: 'BAJRA',
    nameEn: 'Bajra (Pearl Millet)',
    nameHi: 'बाजरा',
    categoryEn: 'Cereals & Millets',
    categoryHi: 'अनाज और कदन',
    icon: '🌾',
    ratePerQtl: '2625.00'
  },
  {
    code: 'JOWAR_HYBRID',
    nameEn: 'Jowar (Sorghum)',
    nameHi: 'ज्वार',
    categoryEn: 'Cereals & Millets',
    categoryHi: 'अनाज और कदन',
    icon: '🌾',
    ratePerQtl: '3371.00'
  },

  // Pulses
  {
    code: 'CHANA',
    nameEn: 'Chana (Gram)',
    nameHi: 'चना',
    categoryEn: 'Pulses',
    categoryHi: 'दलहन',
    icon: '🫘',
    ratePerQtl: '5650.00'
  },
  {
    code: 'TUR_ARHAR',
    nameEn: 'Tur / Arhar (Pigeon Pea)',
    nameHi: 'तूर (अरहर)',
    categoryEn: 'Pulses',
    categoryHi: 'दलहन',
    icon: '🫘',
    ratePerQtl: '7550.00'
  },
  {
    code: 'MOONG',
    nameEn: 'Moong (Green Gram)',
    nameHi: 'मूंग',
    categoryEn: 'Pulses',
    categoryHi: 'दलहन',
    icon: '🫘',
    ratePerQtl: '8682.00'
  },
  {
    code: 'URAD',
    nameEn: 'Urad (Black Gram)',
    nameHi: 'उड़द',
    categoryEn: 'Pulses',
    categoryHi: 'दलहन',
    icon: '🫘',
    ratePerQtl: '7400.00'
  },

  // Oilseeds
  {
    code: 'SOYBEAN_YELLOW',
    nameEn: 'Soybean (Yellow)',
    nameHi: 'सोयाबीन',
    categoryEn: 'Oilseeds',
    categoryHi: 'तिलहन',
    icon: '🌱',
    ratePerQtl: '4892.00'
  },
  {
    code: 'MUSTARD',
    nameEn: 'Mustard & Rapeseed',
    nameHi: 'सरसों',
    categoryEn: 'Oilseeds',
    categoryHi: 'तिलहन',
    icon: '🌼',
    ratePerQtl: '5950.00'
  },
  {
    code: 'GROUNDNUT',
    nameEn: 'Groundnut (Peanut)',
    nameHi: 'मूंगफली',
    categoryEn: 'Oilseeds',
    categoryHi: 'तिलहन',
    icon: '🥜',
    ratePerQtl: '6783.00'
  },

  // Commercial Crops
  {
    code: 'COTTON_MEDIUM',
    nameEn: 'Cotton (Medium Staple)',
    nameHi: 'कपास (मध्यम रेशा)',
    categoryEn: 'Commercial Crops',
    categoryHi: 'व्यावसायिक फसलें',
    icon: '☁️',
    ratePerQtl: '7121.00'
  }
];

export interface CommodityGroup {
  name: string;
  items: CommodityItem[];
}

/** Grouped list for <optgroup> rendering */
export function getCommodityGroups(lang: 'en' | 'hi' = 'en'): CommodityGroup[] {
  const groupsMap = new Map<string, CommodityItem[]>();

  for (const item of COMMODITIES) {
    const key = lang === 'hi' ? item.categoryHi : item.categoryEn;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, []);
    }
    groupsMap.get(key)!.push(item);
  }

  return Array.from(groupsMap.entries()).map(([name, items]) => ({
    name,
    items
  }));
}

const BY_CODE = new Map(COMMODITIES.map((c) => [c.code, c]));

/** Format a commodity code into a human-friendly label with icon */
export function formatCommodity(code: string | null | undefined, lang: 'en' | 'hi' = 'en'): string {
  if (!code) return '—';
  const item = BY_CODE.get(code);
  if (!item) return code;
  const name = lang === 'hi' ? `${item.nameHi} (${item.nameEn})` : `${item.nameEn} (${item.nameHi})`;
  return `${item.icon} ${name}`;
}

/** Get the official MSP rate for a commodity */
export function getCommodityRate(code: string): string | null {
  return BY_CODE.get(code)?.ratePerQtl ?? null;
}
