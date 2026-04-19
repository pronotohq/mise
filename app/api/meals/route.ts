// app/api/meals/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PERIOD_TIME: Record<string, string> = {
  breakfast: '7–9 AM breakfast',
  lunch:     '12–2 PM lunch',
  snack:     '4–5 PM snack',
  dinner:    '6–8 PM dinner',
};

// Real dishes by cuisine — GPT picks from these when ingredients match
const CUISINE_DISHES: Record<string, Record<string, string[]>> = {
  Indian: {
    breakfast: ['Poha', 'Upma', 'Besan Chilla', 'Paratha with Curd', 'Sabudana Khichdi', 'Idli Sambar', 'Aloo Paratha', 'Moong Dal Cheela', 'Bread Poha', 'Rava Dosa', 'Vermicelli Upma (Sewai)', 'Methi Thepla'],
    lunch:     ['Dal Tadka with Rice', 'Rajma Chawal', 'Chole with Bhature/Rice', 'Aloo Gobi Sabzi with Roti', 'Palak Paneer with Roti', 'Matar Paneer with Rice', 'Kadhi Pakora with Rice', 'Baingan Bharta with Roti', 'Pav Bhaji', 'Jeera Rice with Dal', 'Mixed Veg Curry', 'Lauki Sabzi with Roti'],
    snack:     ['Bread Pakora', 'Aloo Chaat', 'Poha Chivda', 'Banana Shake', 'Roasted Chana', 'Sprouts Chaat', 'Makhana Chaat', 'Rava Idli', 'Dhokla', 'Masala Chai with Biscuits'],
    dinner:    ['Dal Makhani with Naan/Roti', 'Chicken Curry with Rice', 'Mutton Rogan Josh', 'Paneer Butter Masala', 'Fish Curry with Rice', 'Egg Bhurji with Paratha', 'Biryani', 'Pulao with Raita', 'Aloo Methi Sabzi with Dal', 'Khichdi with Pickle'],
  },
  Asian: {
    breakfast: ['Congee', 'Soft Boiled Eggs on Toast', 'Miso Soup with Rice', 'Noodle Soup', 'Steamed Buns', 'Omelette Rice'],
    lunch:     ['Fried Rice', 'Chicken Rice', 'Laksa', 'Pad Thai', 'Stir-fried Noodles', 'Tom Yum Soup', 'Japanese Curry', 'Korean Bibimbap', 'Vietnamese Pho'],
    snack:     ['Edamame', 'Rice Crackers', 'Steamed Dumplings', 'Mango Sticky Rice', 'Taro Balls'],
    dinner:    ['Stir-fried Vegetables with Rice', 'Claypot Rice', 'Mee Goreng', 'Nasi Lemak', 'Beef Rendang', 'Steamed Fish with Ginger', 'Kung Pao Chicken', 'Mapo Tofu'],
  },
  Western: {
    breakfast: ['Scrambled Eggs on Toast', 'Omelette', 'Avocado Toast', 'French Toast', 'Pancakes', 'Granola with Yogurt', 'Banana Oat Smoothie'],
    lunch:     ['Grilled Chicken Sandwich', 'Caesar Salad', 'Tomato Soup with Bread', 'Pasta Salad', 'BLT Wrap', 'Omelette with Salad'],
    snack:     ['Apple with Peanut Butter', 'Greek Yogurt', 'Cheese and Crackers', 'Banana Smoothie', 'Boiled Eggs'],
    dinner:    ['Spaghetti Bolognese', 'Roast Chicken with Vegetables', 'Grilled Salmon', 'Beef Stir-fry', 'Pasta Carbonara', 'Chicken Stew', 'Baked Potato with Toppings'],
  },
  Mexican: {
    breakfast: ['Egg Tacos', 'Avocado Toast with Salsa', 'Bean Burrito'],
    lunch:     ['Chicken Quesadilla', 'Bean and Rice Bowl', 'Fish Tacos', 'Veggie Wrap'],
    snack:     ['Guacamole with Crackers', 'Corn on the Cob', 'Fruit Salad'],
    dinner:    ['Chicken Fajitas', 'Beef Tacos', 'Lentil Soup', 'Black Bean Enchiladas', 'Chicken Burrito Bowl'],
  },
  Mediterranean: {
    breakfast: ['Greek Yogurt with Honey', 'Shakshuka', 'Hummus Toast with Eggs'],
    lunch:     ['Greek Salad', 'Falafel Wrap', 'Lentil Soup', 'Tabbouleh with Pita'],
    snack:     ['Hummus with Vegetables', 'Olives and Cheese', 'Fruit and Nuts'],
    dinner:    ['Grilled Fish with Lemon', 'Chicken Shawarma', 'Pasta with Olives and Tomatoes', 'Stuffed Bell Peppers', 'Roasted Vegetable Couscous'],
  },
};

export async function POST(req: NextRequest) {
  try {
    const { pantry, period, dietary, recentlyCooked } = await req.json();
    if (!pantry?.length) return NextResponse.json({ meals: [] });

    const today      = new Date().toISOString().split('T')[0];
    const expiring   = pantry.filter((i: {expiry: string}) => i.expiry <= today);
    const freshItems = pantry.filter((i: {expiry: string}) => i.expiry > today);

    const exclusion = recentlyCooked?.length
      ? `Do NOT suggest: ${recentlyCooked.slice(0,10).join(', ')}. Avoid dishes that are essentially the same.`
      : '';

    const dietCtx = [
      dietary?.isVeg ? 'STRICT VEGETARIAN — no meat, no fish, no chicken' : 'omnivore (meat OK)',
      dietary?.eatsEggs ? 'eats eggs' : dietary?.isVeg ? 'no eggs' : '',
      dietary?.hasToddler ? `toddler present (${dietary.toddlerName||'child'}) — ALL dishes must be toddler-safe: no whole spices, no choking hazards, mild heat, soft textures` : '',
      dietary?.allergies?.length ? `ALLERGIES (strict avoid): ${dietary.allergies.join(', ')}` : '',
    ].filter(Boolean).join(' | ');

    const cuisines: string[] = dietary?.cuisines ?? [];
    const primaryCuisine = cuisines[0] ?? 'Indian';

    // Get dish suggestions for this cuisine + period
    const dishSuggestions = cuisines.flatMap(c =>
      (CUISINE_DISHES[c]?.[period] ?? CUISINE_DISHES.Indian[period] ?? [])
    ).slice(0, 20);

    const cuisineGuide = cuisines.length
      ? `Primary cuisine: ${cuisines.join(' + ')}. Preferred dishes for ${period}: ${dishSuggestions.join(', ')}.`
      : `Default to everyday Indian home cooking for ${period}.`;

    const prompt = `Generate exactly 3 ${PERIOD_TIME[period]} meal suggestions.

CUISINE & AUTHENTICITY:
${cuisineGuide}
Pick dishes FROM that list above that can be made with the available ingredients. If a dish needs one missing ingredient, substitute creatively (e.g. no coriander → skip garnish). Do NOT invent fusion nonsense. Real home-cooked food only.

CRITICAL RULES:
1. Use ONLY ingredients from the fridge list. ALWAYS assume available: water, salt, pepper, oil, basic spices (cumin, turmeric, chilli powder, garam masala, mustard seeds, bay leaf), onion, garlic, ginger, sugar, atta/flour if Indian cuisine.
2. NEVER suggest a dish that makes no culinary sense (milk soup, banana curry, etc).
3. Prioritise expiring items — use them first if a real dish fits.
4. Nutrition must be accurate for the actual dish (not generic estimates).
5. Steps must be practical — what a real home cook does.

Diet: ${dietCtx}
Family: ${dietary?.familySize ?? 2} people
${exclusion}

EXPIRING (use first): ${expiring.length ? expiring.map((i:{name:string;qty:number;unit:string})=>`${i.name}(${i.qty}${i.unit})`).join(', ') : 'none'}
FRIDGE: ${freshItems.map((i:{name:string;qty:number;unit:string;expiry:string})=>`${i.name}(${i.qty}${i.unit},exp:${i.expiry})`).join(', ')}

Return JSON with key "meals" — array of exactly 3:
{
  "id": "m1",
  "name": string,
  "emoji": string,
  "time_minutes": number,
  "servings": number,
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "fibre": number,
  "kid_safe": boolean,
  "uses_expiring": boolean,
  "ingredients_used": [{"name":string,"qty":string}],
  "steps": string[],
  "notes": string
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `You are a home cooking assistant expert in ${primaryCuisine} cuisine. You only suggest dishes real families actually cook at home. Return valid JSON only.` },
        { role: 'user', content: prompt },
      ],
    });

    const content = JSON.parse(completion.choices[0].message.content ?? '{"meals":[]}');
    return NextResponse.json({ meals: content.meals ?? [] });

  } catch (err) {
    console.error('Meals error:', err);
    return NextResponse.json({ error: 'Meal generation failed' }, { status: 500 });
  }
}
