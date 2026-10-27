---
name: market-statistics
description: Answer California housing market questions with sold comps, current inventory, and a 12-month trend.
---

# Market statistics

Use OpenClaw's shell `exec` tool to run the local report. The `terminal` tool only controls already-open Control UI tabs.

For a market question, extract the California city and optionally a ZIP code or property subtype. Run the local report once, then answer from its numbers. Never guess missing months, a year-over-year figure marked N/A, or whether someone should buy a home.

```powershell
Set-Location 'C:\Users\ragha\Documents\IDX-Exchange-Agentic-AI'
npm.cmd run market -- --city 'San Diego'
```

Add `--zip '92101'` or `--type 'Condominium'` when the question asks for that scope. The report includes average and median close price, average price per square foot, days on market, list-to-close ratio, active inventory versus sold volume, monthly trend, and month-over-month/year-over-year changes where data exists. It reads `california_sold` and `rets_property`; it does not call an AI API. If the city has no sales, say so and give the active count without inventing statistics.
