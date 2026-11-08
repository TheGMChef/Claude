export const SAFETY_VOCABULARY: readonly string[] = [
  'violence',
  'gore',
  'death',
  'torture',
  'sexual-content',
  'abuse',
  'child-harm',
  'self-harm',
  'suicide',
  'addiction',
  'slavery',
  'body-horror',
  'insects',
  'spiders',
  'rats',
  'drowning',
  'fire',
  'claustrophobia',
  'religion',
  'hate-bigotry',
  'animal-harm',
  'pregnancy',
  'mental-illness',
  'police',
  'war',
];

export type SafetySettings = { lines: string[]; veils: string[] };

export const DEFAULT_LINES: string[] = ['child-harm'];
