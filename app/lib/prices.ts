// app/api/_lib/prices.ts
// Deterministic price lookup for common grocery items, per-country.
// v1: curated table (maintained monthly). v2: Agmarknet + supermarket scrapers.
// Usage: priceForItem({name, quantity, unit, country}) -> number | undefined
//
// Design rules:
//  - Prices are the typical retail grocery price (Blinkit/BigBasket IN, FairPrice/RedMart SG, supermarket US)
//  - Table stores BASE price for a BASE quantity (e.g. ₹75 per 1kg onion)
//  - Lookup scales to the requested quantity with a conservative unit mapping
//  - If item isn't in the table, return undefined — no guessing

export type Country = 'IN' | 'SG' | 'US';

interface Entry {
  /** list of lowercase aliases that match this item */
  aliases: string[];
  /** base unit for the price value */
  base: 'kg' | 'g' | 'L' | 'ml' | 'pcs' | 'bunch' | 'dozen' | 'loaf' | 'packet';
  /** price per base unit in each country's currency */
  price: Record<Country, number>;
}

// Curated — extend over time. All prices current as of 2026-Q2.
// Kept intentionally SMALL so everything here is vetted. Add 5-10 per week as real usage tells us what's missing.
const TABLE: Entry[] = [
  // Produce
  { aliases: ['spinach','palak','keerai','bayam'],                       base:'bunch', price:{IN:30,   SG:3,    US:3     }},
  { aliases: ['coriander','dhaniya','cilantro'],                         base:'bunch', price:{IN:15,   SG:1.5,  US:2     }},
  { aliases: ['mint','pudina'],                                          base:'bunch', price:{IN:15,   SG:1.5,  US:2     }},
  { aliases: ['tomato','tomatoes','tamatar','thakkali'],                 base:'kg',    price:{IN:60,   SG:5.5,  US:4     }},
  { aliases: ['onion','onions','pyaaz','vengayam','bawang'],             base:'kg',    price:{IN:45,   SG:3,    US:3     }},
  { aliases: ['potato','potatoes','aloo','urulaikilangu','kentang'],     base:'kg',    price:{IN:40,   SG:3.5,  US:2.5   }},
  { aliases: ['carrot','carrots','gajar'],                               base:'kg',    price:{IN:60,   SG:3.5,  US:2.5   }},
  { aliases: ['cucumber','kheera','timun'],                              base:'kg',    price:{IN:60,   SG:3.5,  US:4     }},
  { aliases: ['capsicum','bell pepper','shimla mirch'],                  base:'kg',    price:{IN:140,  SG:7,    US:6     }},
  { aliases: ['broccoli'],                                               base:'pcs',   price:{IN:120,  SG:3,    US:3     }},
  { aliases: ['cauliflower','phool gobi','gobi'],                        base:'pcs',   price:{IN:50,   SG:3.5,  US:4     }},
  { aliases: ['cabbage','patta gobhi','pata gobhi','muttakose'],         base:'pcs',   price:{IN:40,   SG:2.5,  US:3     }},
  { aliases: ['ginger','adrak','inji','halia'],                          base:'kg',    price:{IN:200,  SG:9,    US:8     }},
  { aliases: ['garlic','lehsun','poondu','bawang putih'],                base:'kg',    price:{IN:280,  SG:10,   US:8     }},
  { aliases: ['lemon','lemons','nimbu'],                                 base:'pcs',   price:{IN:6,    SG:0.6,  US:0.7   }},
  { aliases: ['banana','bananas','kela'],                                base:'dozen', price:{IN:60,   SG:3,    US:3.5   }},
  { aliases: ['apple','apples','seb'],                                   base:'kg',    price:{IN:200,  SG:6,    US:5     }},
  { aliases: ['mango','mangoes','aam'],                                  base:'kg',    price:{IN:150,  SG:8,    US:7     }},
  { aliases: ['orange','oranges','santra'],                              base:'kg',    price:{IN:80,   SG:5,    US:3.5   }},
  { aliases: ['papaya','papita'],                                        base:'kg',    price:{IN:50,   SG:4,    US:3.5   }},
  { aliases: ['grapes','angoor'],                                        base:'kg',    price:{IN:120,  SG:6,    US:5     }},
  { aliases: ['strawberry','strawberries'],                              base:'packet',price:{IN:150,  SG:5,    US:4.5   }},
  { aliases: ['okra','bhindi','lady finger'],                            base:'kg',    price:{IN:60,   SG:4,    US:5     }},
  { aliases: ['eggplant','brinjal','baingan'],                           base:'kg',    price:{IN:50,   SG:3,    US:3     }},
  { aliases: ['peas','matar','frozen peas'],                             base:'kg',    price:{IN:100,  SG:4,    US:3     }},
  { aliases: ['mushroom','mushrooms'],                                   base:'packet',price:{IN:60,   SG:2.5,  US:3     }},
  { aliases: ['beans','green beans','french beans'],                     base:'kg',    price:{IN:80,   SG:4,    US:4     }},
  { aliases: ['zucchini'],                                               base:'kg',    price:{IN:120,  SG:5,    US:4     }},
  { aliases: ['avocado'],                                                base:'pcs',   price:{IN:120,  SG:3,    US:2     }},

  // Dairy
  { aliases: ['milk','doodh','paal','susu'],                             base:'L',     price:{IN:68,   SG:3,    US:1.2   }},
  { aliases: ['curd','dahi','thayir','yogurt'],                          base:'kg',    price:{IN:160,  SG:6,    US:5     }},
  { aliases: ['greek yogurt'],                                           base:'kg',    price:{IN:260,  SG:10,   US:6     }},
  { aliases: ['paneer','cottage cheese'],                                base:'kg',    price:{IN:380,  SG:20,   US:15    }},
  { aliases: ['cheese','cheddar','mozzarella'],                          base:'kg',    price:{IN:600,  SG:18,   US:12    }},
  { aliases: ['butter','makhan'],                                        base:'kg',    price:{IN:520,  SG:12,   US:10    }},
  { aliases: ['ghee'],                                                   base:'kg',    price:{IN:700,  SG:20,   US:18    }},
  { aliases: ['cream','fresh cream'],                                    base:'packet',price:{IN:80,   SG:3.5,  US:3     }},

  // Protein
  { aliases: ['egg','eggs','anda','telur','muttai'],                     base:'dozen', price:{IN:90,   SG:4,    US:4.5   }},
  { aliases: ['chicken','chicken breast','murgh','kozhi','ayam'],        base:'kg',    price:{IN:260,  SG:12,   US:14    }},
  { aliases: ['mutton','lamb','gosht'],                                  base:'kg',    price:{IN:700,  SG:22,   US:18    }},
  { aliases: ['fish','salmon','machli','meen','ikan'],                   base:'kg',    price:{IN:400,  SG:18,   US:15    }},
  { aliases: ['prawn','shrimp','jhinga'],                                base:'kg',    price:{IN:500,  SG:22,   US:18    }},
  { aliases: ['tofu','bean curd'],                                       base:'packet',price:{IN:80,   SG:2.5,  US:3     }},

  // Grains / staples
  { aliases: ['rice','basmati rice','chawal','arisi','nasi'],            base:'kg',    price:{IN:120,  SG:4,    US:3     }},
  { aliases: ['brown rice'],                                             base:'kg',    price:{IN:140,  SG:5,    US:3.5   }},
  { aliases: ['atta','wheat flour','whole wheat flour'],                 base:'kg',    price:{IN:55,   SG:2.5,  US:3     }},
  { aliases: ['maida','all purpose flour','flour'],                      base:'kg',    price:{IN:50,   SG:2.5,  US:2     }},
  { aliases: ['oats','oatmeal'],                                         base:'kg',    price:{IN:170,  SG:5,    US:3.5   }},
  { aliases: ['pasta','spaghetti','penne'],                              base:'packet',price:{IN:140,  SG:3,    US:2     }},
  { aliases: ['bread','white bread','roti loaf'],                        base:'loaf',  price:{IN:50,   SG:3,    US:4     }},
  { aliases: ['noodles','maggi','instant noodles'],                      base:'packet',price:{IN:14,   SG:1,    US:1     }},
  { aliases: ['dal','lentils','paruppu','toor dal','tuvar'],             base:'kg',    price:{IN:140,  SG:5,    US:4     }},
  { aliases: ['moong dal','mung'],                                       base:'kg',    price:{IN:120,  SG:5,    US:4     }},
  { aliases: ['chana','chickpeas','garbanzo'],                           base:'kg',    price:{IN:110,  SG:4,    US:3     }},
  { aliases: ['rajma','kidney beans'],                                   base:'kg',    price:{IN:180,  SG:6,    US:4     }},
  { aliases: ['besan','gram flour','chickpea flour'],                    base:'kg',    price:{IN:120,  SG:5,    US:4     }},
  { aliases: ['sugar','cheeni'],                                         base:'kg',    price:{IN:48,   SG:2,    US:1.5   }},
  { aliases: ['salt','namak'],                                           base:'kg',    price:{IN:22,   SG:1,    US:1     }},

  // Beverages / other
  { aliases: ['tea','chai'],                                             base:'packet',price:{IN:180,  SG:5,    US:4     }},
  { aliases: ['coffee','kopi'],                                          base:'packet',price:{IN:320,  SG:10,   US:8     }},
  { aliases: ['oil','cooking oil','sunflower oil','tel'],                base:'L',     price:{IN:160,  SG:7,    US:5     }},
  { aliases: ['olive oil'],                                              base:'L',     price:{IN:600,  SG:15,   US:10    }},
  { aliases: ['honey','shahad','madhu'],                                 base:'kg',    price:{IN:500,  SG:15,   US:10    }},
  { aliases: ['jam','fruit jam'],                                        base:'packet',price:{IN:140,  SG:4,    US:3.5   }},
  { aliases: ['ketchup','tomato sauce'],                                 base:'packet',price:{IN:120,  SG:3.5,  US:3     }},
  { aliases: ['peanut butter'],                                          base:'packet',price:{IN:260,  SG:7,    US:5     }},

  // Spices (small packets)
  { aliases: ['turmeric','haldi'],                                       base:'packet',price:{IN:50,   SG:3,    US:4     }},
  { aliases: ['cumin','jeera'],                                          base:'packet',price:{IN:80,   SG:3,    US:4     }},
  { aliases: ['chilli powder','mirch','red chilli'],                     base:'packet',price:{IN:70,   SG:3,    US:4     }},
  { aliases: ['garam masala'],                                           base:'packet',price:{IN:90,   SG:3.5,  US:4     }},
];

// Build a fast lookup map: alias -> entry
const aliasMap: Map<string, Entry> = (() => {
  const m = new Map<string, Entry>();
  for (const e of TABLE) for (const a of e.aliases) m.set(a.toLowerCase(), e);
  return m;
})();

function findEntry(name: string): Entry | undefined {
  const lc = name.toLowerCase().trim();
  if (aliasMap.has(lc)) return aliasMap.get(lc);
  // substring match fallback (e.g. "fresh spinach" -> spinach)
  for (const [alias, e] of aliasMap) {
    if (lc.includes(alias) || alias.includes(lc)) return e;
  }
  return undefined;
}

// Convert a quantity from one unit to the entry's base unit.
// Returns a multiplier, or undefined if units are incompatible.
function scaleToBase(quantity: number, unit: string, base: Entry['base']): number | undefined {
  const u = unit.toLowerCase().trim();

  if (base === 'kg' || base === 'g') {
    if (u === 'kg') return base==='kg' ? quantity : quantity*1000;
    if (u === 'g')  return base==='kg' ? quantity/1000 : quantity;
  }
  if (base === 'L' || base === 'ml') {
    if (u === 'l' || u === 'L')   return base==='L' ? quantity : quantity*1000;
    if (u === 'ml')                return base==='L' ? quantity/1000 : quantity;
  }
  if (base === 'pcs') {
    if (u === 'pcs' || u === 'pc' || u === 'piece' || u === 'pieces') return quantity;
    if (u === 'dozen')                                                 return quantity*12;
  }
  if (base === 'dozen') {
    if (u === 'dozen')                return quantity;
    if (u === 'pcs' || u === 'piece') return quantity/12;
  }
  if (base === 'bunch' && (u === 'bunch' || u === 'pcs'))     return quantity;
  if (base === 'loaf'  && (u === 'loaf'  || u === 'pcs'))     return quantity;
  if (base === 'packet'&& (u === 'packet'|| u === 'pcs' || u === 'pkt')) return quantity;

  return undefined;
}

export interface PriceQuery {
  name: string;
  quantity?: number;
  unit?: string;
  country: Country;
}

/**
 * Returns a realistic price in the target country's currency for the given item + quantity,
 * or undefined if we don't have a reliable data point.
 */
export function priceForItem({ name, quantity = 1, unit = 'pcs', country }: PriceQuery): number | undefined {
  const entry = findEntry(name);
  if (!entry) return undefined;

  const scale = scaleToBase(quantity, unit, entry.base);
  if (scale === undefined) return undefined;

  const raw = entry.price[country] * scale;
  if (!Number.isFinite(raw) || raw <= 0) return undefined;

  // Round to a sensible precision per currency
  if (country === 'IN') return Math.round(raw);
  return Math.round(raw * 10) / 10;
}

// ────────────────────────────────────────────────────────────
// Future: live market data hooks (stubs for v2).
// The curated table above is the source of truth today. When these go live we
// try them first (cache 24h in KV), fall back to the table.
// ────────────────────────────────────────────────────────────

// India: data.gov.in Agmarknet — daily wholesale mandi prices by commodity + market.
// Endpoint: https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070
// Returns modal price per quintal; retail ≈ wholesale × 1.6–1.9 depending on category.
// Needs AGMARKNET_API_KEY in env. City → nearest mandi mapping required.
export async function priceFromAgmarknet(_name: string, _city: string): Promise<number | undefined> {
  // TODO v2: implement
  return undefined;
}

// Singapore: SingStat — Average Retail Prices of Selected Consumer Items.
// Monthly CSV: https://tablebuilder.singstat.gov.sg/publicfacing/api/json/title/M212881.json
// Covers ~80 food items averaged across major supermarkets. Update monthly.
// No API key required.
export async function priceFromSingStat(_name: string): Promise<number | undefined> {
  // TODO v2: implement
  return undefined;
}

// US: USDA — Specialty Crops Market News API.
// https://www.marketnews.usda.gov/mnp/fv-home for produce; BLS CPI for packaged goods.
export async function priceFromUSDA(_name: string, _region: string): Promise<number | undefined> {
  // TODO v2: implement
  return undefined;
}
