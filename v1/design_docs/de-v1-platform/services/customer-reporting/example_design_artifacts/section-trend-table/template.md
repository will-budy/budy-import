{# ─── Section: Trailing Completion Trend ─────────────────────────────────── #}
{# Pure Markdown section — no HTML partials needed.                             #}
{# Inputs (from values.json):                                                   #}
{#   config.trendWindowPeriods   number of prior weeks to show                  #}
{#   trends[]                    array of { weekLabel, completed, assigned }     #}
{#   metrics.lastWeek            { weekLabel, completed, assigned, open }        #}
{#   rates                       { previousAvgPct, currentPct, trend,           #}
{#                                 previousCompleted, previousAssigned }         #}

## Trailing {{ config.trendWindowPeriods }}-Week Completion Trend

{% if metrics.lastWeek.open > 0 -%}
**{{ metrics.lastWeek.open }} task{{ "s are" if metrics.lastWeek.open != 1 else " is" }} still open from last week.**

{% endif -%}
| Week | Completed / Assigned |
|------|----------------------|
{% for row in trends -%}
| {{ row.weekLabel }} | {{ row.completed }}/{{ row.assigned }} |
{% endfor -%}
| **{{ metrics.lastWeek.weekLabel }}** _(Last Wk)_ | **{{ metrics.lastWeek.completed }}/{{ metrics.lastWeek.assigned }}** |

|  | Previous {{ config.trendWindowPeriods }}-Wk Avg | Last Week |
|--|--|--|
| Avg Completion Rate | {{ rates.previousAvgPct }}% | {{ rates.currentPct }}% {% if rates.trend == "down" %}↓{% elif rates.trend == "up" %}↑{% endif %} |
| Completed / Assigned | {{ rates.previousCompleted }}/{{ rates.previousAssigned }} | {{ metrics.lastWeek.completed }}/{{ metrics.lastWeek.assigned }} |
