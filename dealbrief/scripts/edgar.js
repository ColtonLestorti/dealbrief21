/* ============================================================
   edgar.js — Authoritative deal-mandate lookups from SEC EDGAR
   ------------------------------------------------------------
   No API key required. Uses EDGAR's free full-text search API
   (efts.sec.gov) to find recent merger filings that NAME a
   covered bank as financial advisor.

   Why EDGAR: when a US public company is acquired, the merger
   proxy (DEFM14A), tender-offer docs (SC 14D9), and 8-Ks name
   the financial advisors in the legal record. That makes any
   match here a "Filed" fact a rep can quote with confidence —
   as opposed to a news mention, which may be wrong.

   Scope/limits (be honest about these):
     - US public-company deals only.
     - Filings lag the press release by days to weeks.
     - Private-market and pure sell-side mandates may not appear.
   These gaps are filled later by the news-API layer ("Reported").

   Exports: getFiledMandates(bankNames) -> [{ bank, title, form,
            date, url, confidence: "Filed" }]
   ============================================================ */

// SEC requires a descriptive User-Agent with contact info.
// Set EDGAR_UA in the environment, e.g. "DealBrief admin@yourdomain.com".
const UA = process.env.EDGAR_UA || 'DealBrief research contact@example.com';

// Merger-specific forms that name financial advisors. We deliberately
// exclude the generic 8-K here: it's high-volume and mentions banks for
// many non-advisory reasons, which would undercut the "Filed = trusted"
// promise. (8-K can be added back via EDGAR_INCLUDE_8K=1 if desired.)
const MNA_FORMS = ['DEFM14A', 'PREM14A', 'SC 14D9', 'SC 13E3', '425'];
if (process.env.EDGAR_INCLUDE_8K === '1') MNA_FORMS.push('8-K');

// How many days back to look for fresh filings.
const LOOKBACK_DAYS = Number(process.env.EDGAR_LOOKBACK_DAYS || 30);

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Run one EDGAR full-text search.
 * Endpoint: https://efts.sec.gov/LATEST/search-index
 * Returns JSON: { hits: { hits: [ { _id, _source } ] } }
 *
 * `q` is passed through as-is, so callers can use quoted phrases and
 * boolean operators (AND/OR/NOT). Date filtering requires the
 * dateRange=custom flag alongside startdt/enddt.
 */
async function search(q, { startdt, enddt, forms } = {}) {
  const url = new URL('https://efts.sec.gov/LATEST/search-index');
  url.searchParams.set('q', q);
  if (forms) url.searchParams.set('forms', forms);
  if (startdt && enddt) {
    url.searchParams.set('dateRange', 'custom');
    url.searchParams.set('startdt', startdt);
    url.searchParams.set('enddt', enddt);
  }
  url.searchParams.set('sort', 'desc'); // newest first

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' }
  });

  if (!res.ok) {
    throw new Error(`EDGAR search failed (${res.status}) for ${q}`);
  }
  return res.json();
}

/**
 * Build a viewable filing URL from an EDGAR hit.
 */
function filingUrl(hit) {
  // _id looks like "0001193125-26-000123:dform8k.htm"
  const [accession, file] = (hit._id || '').split(':');
  const cik = (hit._source?.cik || hit._source?.ciks?.[0] || '').replace(/^0+/, '');
  if (!accession || !cik) return 'https://www.sec.gov/cgi-bin/browse-edgar';
  const accNoDashes = accession.replace(/-/g, '');
  const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${accNoDashes}`;
  return file ? `${base}/${file}` : base;
}

/**
 * For each bank, find recent filings that name it as advisor.
 * Returns a de-duplicated, recency-sorted list of "Filed" mandates.
 *
 * @param {string[]} bankNames
 * @param {object}   [opts]
 * @param {number}   [opts.perBank=3]  max mandates to keep per bank
 * @returns {Promise<Array>}
 */
export async function getFiledMandates(bankNames, { perBank = 3 } = {}) {
  const startdt = isoDaysAgo(LOOKBACK_DAYS);
  const enddt = new Date().toISOString().slice(0, 10);
  const out = [];

  for (const bank of bankNames) {
    // Two quoted phrases AND'd together: the bank name AND advisory
    // language. This matches filings where the bank is named in an
    // advisory context, without requiring one exact run-on phrase.
    const q = `"${bank}" "financial advisor"`;
    try {
      const json = await search(q, {
        startdt,
        enddt,
        forms: MNA_FORMS.join(',')
      });

      const hits = json?.hits?.hits || [];
      const seen = new Set();
      let kept = 0;

      for (const hit of hits) {
        if (kept >= perBank) break;
        const src = hit._source || {};
        const title = (src.display_names?.[0] || src.entity || 'Filing').trim();
        const form = src.file_type || src.root_form || src.form || 'Filing';
        const date = src.file_date || src.filed || enddt;
        const key = `${bank}|${title}|${form}`;
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({
          bank,
          title,
          form,
          date,
          url: filingUrl(hit),
          confidence: 'Filed'
        });
        kept++;
      }
    } catch (err) {
      // One bank failing should never sink the whole run.
      console.warn(`EDGAR lookup skipped for ${bank}: ${err.message}`);
    }

    // Be polite to SEC's servers: ~5 req/sec max. Space them out.
    await new Promise(r => setTimeout(r, 250));
  }

  // Newest first.
  out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return out;
}
