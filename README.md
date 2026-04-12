# Mise — Deploy in 3 steps

## What you need
- GitHub account (free)
- Vercel account (free) — vercel.com
- OpenAI API key — platform.openai.com

---

## Step 1 — Push to GitHub

```bash
cd mise-v0
git init
git add .
git commit -m "Mise MVP"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/mise.git
git push -u origin main
```

---

## Step 2 — Deploy to Vercel

1. Go to vercel.com → New Project
2. Import your GitHub repo `mise`
3. Framework: **Next.js** (auto-detected)
4. Add environment variable:
   - Key: `OPENAI_API_KEY`
   - Value: `sk-...` (your OpenAI key)
5. Click **Deploy**

Done. You get a URL like `mise.vercel.app`.

---

## Step 3 — Add to home screen (PWA)

On your phone:
- iOS: Open in Safari → Share → Add to Home Screen
- Android: Open in Chrome → menu → Add to Home Screen

---

## What works out of the box

| Feature | Status | Notes |
|---|---|---|
| Voice add | ✅ Live | Browser SpeechRecognition on Chrome/Android. Whisper on iOS. |
| Expiry auto-calc | ✅ Live | 200+ item dictionary, no API call |
| Meal suggestions | ✅ Live | GPT-4o generates from your fridge |
| Swipe used/wasted | ✅ Live | Pantry updates instantly |
| Cook mode | ✅ Live | Step-by-step, deducts ingredients on done |
| Premium paywall | ✅ Live | Simulated (no Stripe yet) |
| Insights | ✅ Live | Fridge value, cook history |
| Onboarding | ✅ Live | 7 steps, family setup, toddler filter |
| Data persistence | ✅ Live | localStorage — no database needed |
| 14-day recipe memory | ✅ Live | No repeats from cook history |

## What needs adding later (v2)

| Feature | Add |
|---|---|
| Real auth + multi-device sync | Supabase |
| Real payments | Stripe |
| Email sync (Swiggy, Amazon) | Nylas v3 |
| Push notifications | Expo (for native app) |
| Barcode scan | Open Food Facts API |

---

## Costs

At 1,000 active users:
- OpenAI voice (Whisper): ~$0.006 per note × 2/week = **~$12/month**
- OpenAI meals (GPT-4o): ~$0.01 per generation × 30/user/month = **~$30/month**
- Vercel hosting: **Free** (hobby plan covers it)

**Total: ~$42/month for 1,000 users** — covered by ~15 premium subscribers.
