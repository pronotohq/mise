'use client';

// FreshNudge — PostHog wiring
// - Initialises PostHog client-side with the project key
// - Auto-captures clicks, pageviews, and session replays (configured on dashboard)
// - Exposes a `track` helper for explicit events

import { useEffect } from 'react';
import posthog from 'posthog-js';

const KEY  = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

let initialized = false;

export function PostHogInit() {
  useEffect(() => {
    if (initialized) return;
    if (!KEY) return; // no-op until env var is set
    posthog.init(KEY, {
      api_host: HOST,
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
      session_recording: {
        // safe defaults — don't record text inside inputs or sensitive selectors
        maskAllInputs: true,
      },
      person_profiles: 'identified_only',
      loaded: (ph) => {
        if (process.env.NODE_ENV !== 'production') ph.debug(false);
      },
    });
    initialized = true;
  }, []);
  return null;
}

/** Track a named event. No-op if PostHog isn't configured. */
export function track(event: string, properties?: Record<string, unknown>) {
  if (!KEY) return;
  try { posthog.capture(event, properties); } catch {}
}

/** Attach a stable userId once the user completes onboarding. */
export function identify(userId: string, traits?: Record<string, unknown>) {
  if (!KEY) return;
  try { posthog.identify(userId, traits); } catch {}
}
