#!/usr/bin/env python3
"""Weekly GSC search-performance digest for mydoublecheck.app.

Pulls Google Search Console Search Analytics, compares the last 7 days of
available data against the prior 7 days, and surfaces:
  - top pages by clicks + biggest week-over-week movers (the "winners")
  - "striking distance" queries (avg position 5-15, real impressions) that
    are one nudge away from page-1 clicks
  - high-impression / zero-click pages (title/meta-description opportunities)

Delivery reuses the backend's /internal/send-digest endpoint (Resend), the
same channel the ops digest uses, so this lands in the inbox.

Env:
  GSC_SA_JSON     service-account key JSON (string) with Search Console access
  GSC_SA_FILE     ...or a path to the key file (alternative to GSC_SA_JSON)
  METRICS_TOKEN   token for POST /internal/send-digest
  SEND_DIGEST_URL override delivery endpoint (default prod backend)
  GSC_SITE        GSC property (default sc-domain:mydoublecheck.app)

Read-only against GSC. Exits 0 even when GSC is empty so CI stays green; exits
non-zero only on auth/delivery failure so a broken pipe is visible.
"""
import datetime
import json
import os
import sys
import urllib.error
import urllib.request

from google.oauth2 import service_account
import google.auth.transport.requests as gtr

SITE = os.getenv("GSC_SITE", "sc-domain:mydoublecheck.app")
SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]
SEND_URL = os.getenv(
    "SEND_DIGEST_URL",
    "https://web-production-970ba.up.railway.app/internal/send-digest",
)
API = "https://searchconsole.googleapis.com/webmasters/v3/sites/{site}/searchAnalytics/query"

# GSC data lags ~2-3 days; end the window 3 days back so it is complete.
LAG_DAYS = 3
STRIKING_MIN_POS, STRIKING_MAX_POS = 5.0, 15.0
STRIKING_MIN_IMPR = 15  # ignore long-tail noise


def _load_creds():
    raw = os.getenv("GSC_SA_JSON")
    if raw:
        info = json.loads(raw)
        creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    else:
        path = os.getenv("GSC_SA_FILE")
        if not path:
            sys.exit("no GSC_SA_JSON or GSC_SA_FILE provided")
        creds = service_account.Credentials.from_service_account_file(path, scopes=SCOPES)
    creds.refresh(gtr.Request())
    return creds


def _query(token, start, end, dimension):
    body = json.dumps({
        "startDate": start,
        "endDate": end,
        "dimensions": [dimension],
        "rowLimit": 1000,
    }).encode()
    url = API.format(site=urllib.request.quote(SITE, safe=""))
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r).get("rows", [])
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:300]
        sys.exit(f"GSC query failed ({e.code}) for {dimension}: {detail}")


def _key(row):
    return row["keys"][0]


def _index(rows):
    return {_key(r): r for r in rows}


def _fmt_pct(cur, prev):
    if prev == 0:
        return "new" if cur else "0"
    return f"{(cur - prev) / prev * 100:+.0f}%"


def _short(url, n=52):
    p = url
    for prefix in ("https://www.mydoublecheck.app", "https://mydoublecheck.app"):
        if p.startswith(prefix):
            p = p[len(prefix):]
            break
    p = p or "/"
    return p if len(p) <= n else p[: n - 1] + "…"


def main():
    creds = _load_creds()
    token = creds.token

    today = datetime.date.today()
    end = today - datetime.timedelta(days=LAG_DAYS)
    start = end - datetime.timedelta(days=6)            # last 7d
    pend = start - datetime.timedelta(days=1)           # prior window end
    pstart = pend - datetime.timedelta(days=6)          # prior 7d
    iso = lambda d: d.isoformat()

    pages_now = _index(_query(token, iso(start), iso(end), "page"))
    pages_prev = _index(_query(token, iso(pstart), iso(pend), "page"))
    queries_now = _query(token, iso(start), iso(end), "query")

    tot_clicks = sum(r["clicks"] for r in pages_now.values())
    tot_impr = sum(r["impressions"] for r in pages_now.values())
    prev_clicks = sum(r["clicks"] for r in pages_prev.values())

    lines = [
        f"DOUBLE CHECK — SEO PERFORMANCE ({iso(start)} → {iso(end)})",
        "",
        f"TOTALS: {int(tot_clicks)} clicks ({_fmt_pct(tot_clicks, prev_clicks)} WoW), "
        f"{int(tot_impr)} impressions across {len(pages_now)} pages.",
        "",
    ]

    # Winners: pages ranked by clicks, with WoW delta.
    top = sorted(pages_now.values(), key=lambda r: r["clicks"], reverse=True)[:8]
    if any(r["clicks"] for r in top):
        lines.append("TOP PAGES (clicks, WoW):")
        for r in top:
            if not r["clicks"]:
                continue
            prev = pages_prev.get(_key(r), {}).get("clicks", 0)
            lines.append(
                f"  {int(r['clicks']):>3}  ({_fmt_pct(r['clicks'], prev):>5})  "
                f"pos {r['position']:.0f}  {_short(_key(r))}"
            )
        lines.append("")

    # Movers: biggest click swings WoW (emphasis on what's working / slipping).
    deltas = []
    for k, r in pages_now.items():
        d = r["clicks"] - pages_prev.get(k, {}).get("clicks", 0)
        if d:
            deltas.append((d, k))
    gainers = sorted([x for x in deltas if x[0] > 0], reverse=True)[:5]
    losers = sorted([x for x in deltas if x[0] < 0])[:5]
    if gainers:
        lines.append("RISING (lean into these — refresh, internal-link, expand):")
        lines += [f"  +{int(d)}  {_short(k)}" for d, k in gainers]
        lines.append("")
    if losers:
        lines.append("SLIPPING (check for ranking drop or seasonality):")
        lines += [f"  {int(d)}  {_short(k)}" for d, k in losers]
        lines.append("")

    # Striking distance: position 5-15 with real impressions = page-1 opportunities.
    strike = [
        r for r in queries_now
        if STRIKING_MIN_POS <= r["position"] <= STRIKING_MAX_POS
        and r["impressions"] >= STRIKING_MIN_IMPR
    ]
    strike.sort(key=lambda r: r["impressions"], reverse=True)
    if strike:
        lines.append("STRIKING DISTANCE (pos 5-15, push to page 1):")
        for r in strike[:10]:
            lines.append(
                f"  pos {r['position']:.1f}  {int(r['impressions'])} impr  "
                f"{int(r['clicks'])} clk  \"{_key(r)}\""
            )
        lines.append("")

    # Impressions but no clicks = title/meta rewrite opportunity.
    no_click = [
        r for r in pages_now.values()
        if r["impressions"] >= 20 and r["clicks"] == 0
    ]
    no_click.sort(key=lambda r: r["impressions"], reverse=True)
    if no_click:
        lines.append("IMPRESSIONS, ZERO CLICKS (rewrite title/meta description):")
        for r in no_click[:6]:
            lines.append(f"  {int(r['impressions'])} impr  pos {r['position']:.0f}  {_short(_key(r))}")
        lines.append("")

    if tot_impr == 0:
        lines.append("No Search Console data in this window yet (very early-stage or "
                     "property just verified). Nothing actionable.")

    body = "\n".join(lines).rstrip() + "\n"
    print(body)

    if os.getenv("SEO_NO_SEND"):
        return  # data-only mode for the auto-fix agent; skip email delivery

    token_m = os.getenv("METRICS_TOKEN")
    if not token_m:
        sys.exit("METRICS_TOKEN not set — cannot deliver digest")
    payload = json.dumps({
        "subject": f"Double Check SEO performance - {iso(end)}",
        "body": body,
    }).encode()
    req = urllib.request.Request(SEND_URL, data=payload, method="POST", headers={
        "Content-Type": "application/json",
        "x-metrics-token": token_m,
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print("delivery:", r.status, r.read().decode()[:120])
    except urllib.error.HTTPError as e:
        sys.exit(f"delivery failed ({e.code}): {e.read().decode()[:200]}")


if __name__ == "__main__":
    main()
