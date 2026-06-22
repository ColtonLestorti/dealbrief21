# Daily Brief Automation — Setup Guide

DealBrief can regenerate `data/daily.json` automatically every weekday morning using the
Claude API with web search. Here's how it works and how to turn it on.

---

## How it works

```
Every weekday 6 AM ET
        │
        ▼
GitHub Action runs scripts/generate-brief.js
        │
        ▼
Claude (with web search) finds today's M&A news,
formats it to the daily.json schema
        │
        ▼
Action commits the new daily.json back to your repo
        │
        ▼
GitHub Pages serves the fresh brief — no manual step
```

The only thing you do daily is **nothing**. The only thing you do once is add an API key.

---

## One-time setup (about 5 minutes)

### Step 1 — Get an Anthropic API key
1. Go to **console.anthropic.com**
2. Sign in (or create an account)
3. Go to **API Keys** → **Create Key**
4. Copy the key (starts with `sk-ant-...`) — you won't see it again

> Note: API usage is paid per use. This brief runs once a weekday and costs roughly a few
> cents per run. Check console.anthropic.com for current pricing.

### Step 2 — Add the key to your GitHub repo
1. Go to your repo → **Settings**
2. Left sidebar → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `ANTHROPIC_API_KEY`
5. Value: paste your key
6. Click **Add secret**

### Step 3 — Enable Actions write access
1. Repo → **Settings** → **Actions** → **General**
2. Scroll to **Workflow permissions**
3. Select **Read and write permissions**
4. Click **Save**

That's it. The workflow file (`.github/workflows/daily-brief.yml`) is already in your repo.

---

## Test it now (don't wait for 6 AM)

1. Go to your repo → **Actions** tab
2. Click **Generate Daily Brief** in the left sidebar
3. Click **Run workflow** → **Run workflow**
4. Watch it run (takes ~1–2 minutes)
5. When it finishes, check `data/daily.json` — it should have today's date and fresh content

---

## Changing what the brief covers

Everything about tone, focus, and selection logic lives in one place:
**`scripts/generate-brief.js`** → the `SYSTEM_PROMPT` variable.

That's your Daily Intelligence Prompt. Edit the wording there to change:
- Which banks get prioritized
- How aggressive the outreach drafts are
- What counts as a "market-wide" vs "bank-specific" story
- The number of stories and opportunities

The script automatically reads your `banks.json`, so when you add or remove banks from your
coverage universe, the prompt updates itself — no need to edit the prompt for that.

---

## Changing the schedule

In `.github/workflows/daily-brief.yml`, edit the cron line:

```yaml
- cron: '0 11 * * 1-5'   # Mon–Fri at 11:00 UTC (6 AM ET)
```

- `0 11 * * 1-5` = weekdays at 11:00 UTC
- Change `11` to a different UTC hour to shift the time
- Change `1-5` to `1-7` to include weekends

(Use crontab.guru if you want to experiment with the format.)

---

## If something goes wrong

**The Action fails:** Open the Actions tab → click the failed run → read the log. The most
common cause is a missing or invalid `ANTHROPIC_API_KEY` secret.

**The brief looks wrong:** The model occasionally returns imperfect data. The script validates
required fields and will fail loudly rather than commit a broken file, so your site keeps
showing the last good brief. You can also always edit `data/daily.json` by hand.

**You want to pause automation:** Repo → Actions → Generate Daily Brief → **⋯** → Disable workflow.

---

## Fully manual alternative

If you'd rather not use the API at all, you can run your Daily Intelligence Prompt in Claude
yourself each morning, copy the JSON output, and paste it into `data/daily.json` directly via
the GitHub web editor. The site doesn't care how the file gets updated.
