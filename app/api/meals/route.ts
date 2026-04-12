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

    const today     = new Date().toISOString().split('T')[0];
    const expiring  = pantry.filter((i: {expiry: string}) => i.expiry <= today);
    const freshItems= pantry.filter((i: {expiry: string}) => i.expiry > today);

    const exclusion = recentlyCooked?.length
      ? `\nDo NOT suggest any of these (cooked recently):\n${recentlyCooked.map((n: string) => `- ${n}`).join('\n')}\nAlso avoid dishes that are essentially the same under a different name.\n`
      : '';

    const dietCtx = [
      dietary?.isVeg ? 'vegetarian' : 'omnivore',
      dietary?.eatsEggs ? 'eats eggs' : 'no eggs',
      dietary?.hasToddler
        ? `has a toddler (${dietary.toddlerName || 'child'}, age ${dietary.toddlerAge || 2}) — ALL suggestions must be toddler-safe (no spice, no whole nuts, no raw honey, no choking hazards, soft textures, mild flavours)`
        : '',
      dietary?.allergies?.length ? `allergies: ${dietary.allergies.join(', ')}` : '',
    ].filter(Boolean).join(', ');

    const prompt = `Generate exactly 3 ${PERIOD_TIME[period]} recipes using ONLY the ingredients listed below.

Diet: ${dietCtx}
Family size: ${dietary?.familySize ?? 2} people
${exclusion}
EXPIRING TODAY — use these first:
${expiring.length ? expiring.map((i: {name: string; qty: number; unit: string}) => `- ${i.name} (${i.qty}${i.unit})`).join('\n') : '(none expiring today)'}

OTHER AVAILABLE INGREDIENTS:
${freshItems.map((i: {name: string; qty: number; unit: string; expiry: string}) => `- ${i.name} (${i.qty}${i.unit}, expires ${i.expiry})`).join('\n')}

Return a JSON object with key "meals" — an array of exactly 3 meal objects:
{
  "id": "m1",
  "name": string,
  "emoji": string (one emoji),
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
  "notes": string (one-line tip; mention toddler portion if kid_safe)
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a smart home cooking assistant. Return only valid JSON.' },
        { role: 'user',   content: prompt }
      ],
    });

    const content = JSON.parse(completion.choices[0].message.content ?? '{"meals":[]}');
    return NextResponse.json({ meals: content.meals ?? [] });

  } catch (err: unknown) {
    console.error('Meals error:', err);
    return NextResponse.json({ error: 'Meal generation failed' }, { status: 500 });
  }
}
