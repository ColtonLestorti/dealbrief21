/* ============================================================
   json-extract.js — Pull a JSON object out of a Claude text response
   that may carry narrative preamble/commentary and/or a fenced code
   block wrapped around the actual JSON. Shared by generate-brief.js
   and generate-market.js.
   ============================================================ */

/**
 * Extract and parse the JSON object from a model's raw text response.
 * Tries, in order:
 *   1. The text is already valid JSON on its own.
 *   2. A ``` ... ``` (optionally ```json) fence appears anywhere in
 *      the text, possibly preceded by narrative text.
 *   3. No fence, but a JSON object can be recovered by taking the
 *      substring from the first "{" to the last "}".
 * Throws the underlying JSON.parse error if none of these succeed.
 * @param {string} text
 * @returns {object}
 */
export function extractJsonFromModelText(text) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to fence/brace extraction
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    return JSON.parse(fenceMatch[1].trim());
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }

  // Nothing worked — parse the original text to surface a real error.
  return JSON.parse(trimmed);
}
