# Hot Trends BI Dashboard

This repository hosts the online Hot Trends BI dashboard and a daily GitHub Actions updater.

## Online entry

After GitHub Pages is enabled with Source = GitHub Actions, the dashboard will be available at:

https://valmaragret79-dot.github.io/hot-trends-bi-dashboard/

Direct dashboard file:

https://valmaragret79-dot.github.io/hot-trends-bi-dashboard/hot_trends_bi_dashboard.html

## Automation

Workflow: `.github/workflows/daily-hot-trends.yml`

- Runs daily at `14:30 UTC`.
- Approximate China time: `22:30`.
- Approximate US Eastern daylight time: `10:30`.
- Can also be run manually from the GitHub Actions tab with an optional `report_date` input.

The updater uses public sources:

- Google Trends US RSS
- Reddit r/popular
- GDELT US News
- Trends24 United States

It updates `outputs/hot_trends_bi_dashboard.html` and writes the latest run summary to `outputs/hot_trends_latest.json`.
Last deploy check: 2026-07-06
