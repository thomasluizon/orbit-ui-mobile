/**
 * Display clamp threshold for the Astra daily summary: anything longer renders
 * clamped to three lines behind a see-more/see-less toggle. Independent of the
 * backend generation cap (orbit-api AiSummaryService.MaxSummaryChars = 300).
 */
export const AI_SUMMARY_CLAMP_CHARS = 140
