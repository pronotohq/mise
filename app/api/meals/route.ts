// app/api/meals/route.ts
// Generates 3 meal suggestions for a given period using fridge contents
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PERIOD_TIME: Record<string, string> = {
  breakfast: '7–9 AM breakfast',
  lunch:     '12–2 PM lunch',
  snack:     '4–5 PM snack',
  dinner:    '6–8 PM dinner',
};

export async function POST(req: NextRequest) {
  try {
    const { pantry, period, dietary, recentlyCooked } = await req.json();

    if (!pantry?.length) {
      return NextResponse.json({ meals: [] });
    }

    const today      = new Date().toISOString().split('T')[0];
    const expiring   = pantry.filter((i: {expiry: string}) => i.expiry <= today);
    const freshItems = pantry.filter((i: {expiry: string}) => i.expiry > today);

    const exclusion = recentlyCooked?.length
      ? `\nDo NOT suggest any of these (cooked recently):\n${recentlyCooked.map((n: string) => `- ${n}`).join('\n')}\nAlso avoid dishes that are essentially the same under a different name.\n`
      : '';

    const dietCtx = [
      dietary?.isVeg ? 'vegetarian' : 'omnivore',
      dietary?.eatsEggs ? 'eats eggs' : 'no eggs',
      dietary?.hasToddler
        ? `has a toddler (${dietary.toddlerName || 'child'}) — ALL suggestions must be toddler-safe (no spice, no whole nuts, no raw honey, soft textures, mild flavours)`
        : '',
      dietary?.allergies?.length ? `allergies: ${dietary.allergies.join(', ')}` : '',
    ].filter(Boolean).join(', ');

    const cuisines: string[] = dietary?.cuisines ?? [];
    const cuisineMap: Record<string, string> = {
      Indian:        'Indian home cooking — dal, sabzi, khichdi, poha, upma, paratha, rajma, chole, aloo dishes, rice dishes. Everyday simple food.',
      Asian:         'Asian home cooking — stir-fries, fried rice, noodle soups, congee, curries, tofu dishes.',
      Western:       'Western home cooking — pasta, sandwiches, wraps, omelettes, roasted vegetables, simple soups.',
      Mexican:       'Mexican / Middle Eastern — wraps, grain bowls, hummus, lentil soups.',
      Mediterranean: 'Mediterranean — grain bowls, roasted vegetables, fish, legumes.',
    };
    const cuisineCtx = cuisines.length
      ? `Cuisine style: ${cuisines.map(c => cuisineMap[c] || c).join(' | ')}`
      : 'Practical everyday home-cooked meals.';

    const prompt = `Generate exactly 3 ${PERIOD_TIME[period]} meal suggestions.

CRITICAL RULES — read carefully before generating:
1. ONLY use ingredients from the fridge list below. Assume these basic staples are ALWAYS available even if not listed: water, salt, pepper, basic spices (cumin, turmeric, chili powder, garam masala), cooking oil, onion, garlic, ginger, sugar.
2. NEVER suggest a dish that doesn't make culinary sense. "Milk soup", "banana curry", "juice stir-fry" are NOT real dishes — never suggest these.
3. Each recipe must be something a real home cook would actually make with those ingredients.
4. If fridge items alone don't make a complete meal, combine them with the assumed staples above.
5. Prioritize expiring items — use them first if they fit into a real dish.
6. Match the time of day: breakfast = quick/light, lunch = moderate, dinner = fuller meal, snack = small bite.
7. Never suggest raw or unsafe combinations.

Diet: ${dietCtx}
Family size: ${dietary?.familySize ?? 2} people
${cuisineCtx}
${exclusion}
EXPIRING SOON — use these first if they fit a real dish:
${expiring.length ? expiring.map((i: {name: string; qty: number; unit: string}) => `- ${i.name} (${i.qty}${i.unit})`).join('\n') : '(none expiring today)'}

FRIDGE CONTENTS:
${freshItems.map((i: {name: string; qty: number; unit: string; expiry: string}) => `- ${i.name} (${i.qty}${i.unit}, expires ${i.expiry})`).join('\n')}

Return a JSON object with key "meals" — an array of exactly 3 meal objects:
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
  "kid_safe": boolean,
  "uses_expiring": boolean,
  "ingredients_used": [{"name": string, "qty": string}],
  "steps": string[] (4–6 clear steps),
  "notes": string (one-line practical tip)
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a practical home cooking assistant. Only suggest real dishes that people actually cook. Never suggest nonsensical ingredient combinations. Return only valid JSON.'
        },
        { role: 'user', content: prompt }
      ],
    });

    const content = JSON.parse(completion.choices[0].message.content ?? '{"meals":[]}');
    return NextResponse.json({ meals: content.meals ?? [] });

  } catch (err: unknown) {
    console.error('Meals error:', err);
    return NextResponse.json({ error: 'Meal generation failed' }, { status: 500 });
  }
}
