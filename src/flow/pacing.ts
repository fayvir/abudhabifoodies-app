/**
 * Chat pacing: how long the "typing" bubble shows before the next question or
 * the recommendation. Everything is answered on the phone, so without this the
 * next question appears in the same frame as the tap, which reads as a form,
 * not a conversation. Short enough not to feel slow; the result waits a little
 * longer so it feels found rather than pre-printed.
 *
 * Mutable on purpose so tests can set 0 (jest.setup.js does, for every test
 * file; pacing tests set their own values). 0 means no pause at all.
 */
export const FLOW_PACING = {
  /** Before each next question. */
  questionMs: 700,
  /** Before the recommendation (or the no-match note). */
  resultMs: 1200,
};
