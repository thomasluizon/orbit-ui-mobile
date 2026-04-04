---
description: Feature-specific implementation patterns -- onboarding, AI, checklists, mobile, widget
---

# Feature Reference

## Onboarding

Hybrid: 2-slide wizard gated by `hasCompletedOnboarding`. Persistent mission checklist on Today page (6 missions). localStorage tracks completion, backend tracks dismiss.

## Feature Guide

`FeatureGuideDrawer` uses `AppOverlay`. Five tabbed sections with i18n content.

## AI Summary

`HabitSummaryCard` at top of Today view. TanStack Query hook, skeleton loading, auto-refreshes via cache invalidation.

## AI Retrospective

Pro-only. Manual trigger (not auto-fetch). Periods: week, month, quarter, semester, year. Backend caches 1h.

## AI Chat

Multi-turn (last 10 messages). Can create/update/delete habits, log, suggest breakdowns, assign tags. Voice input, image upload.

## Slip Alerts

Bad habits: `slipAlertEnabled`. Backend detects patterns from 60-day history. AI-generated push notifications.

## Checklists

Two modes: editable (form) and interactive (auto-save on toggle). Auto-reset on recurring habit log. Templates via localStorage. Progress badge on HabitCard.

## Goals

CRUD, progress, habit linking. Pro-gated. Status: on_track, at_risk, behind, no_deadline, completed.

## Gamification

Achievements, XP, levels, streak + freeze. Pro-only. Server-computed.

## Referral

Cookie-based code (7-day). Applied at signup. Stripe discount for both parties.

## Mobile Native Features

- Push: expo-notifications
- Auth: expo-secure-store
- Voice: expo-speech
- Updates: expo-updates
- Reorder: react-native-draggable-flatlist
- Animations: react-native-reanimated
- Bottom sheets: @gorhom/bottom-sheet
- Offline: expo-sqlite + NetInfo
