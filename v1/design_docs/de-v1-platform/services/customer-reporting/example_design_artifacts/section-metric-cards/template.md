{# ─── Section: Task Overview — Metric Cards ───────────────────────────────── #}
{# Mixed: HTML partial for the number cards (can't express visual weight in     #}
{# plain Markdown), pure Markdown for the text alert below.                     #}
{#                                                                               #}
{# Inputs (from values.json):                                                   #}
{#   scope.name         counselor display name                                  #}
{#   scope.community    community name                                           #}
{#   metrics.assigned   tasks assigned last week                                 #}
{#   metrics.completed  tasks completed last week                                #}
{#   metrics.open       tasks still open from last week                          #}
{#   metrics.allOpen    total open tasks (all time)                              #}
{#                                                                               #}
{# Partials: partial-metric-cards.html                                           #}
{#   Expects a `cards` variable in scope — array of { label, value }.           #}
{#   Include it immediately after setting `cards` so the variable is in scope.  #}

## Last Week Task Overview

{% set cards = [
  { "label": "LW ASSIGNED",  "value": metrics.assigned },
  { "label": "LW COMPLETED", "value": metrics.completed },
  { "label": "LW OPEN",      "value": metrics.open },
  { "label": "ALL OPEN",     "value": metrics.allOpen }
] %}
{% include "partial-metric-cards.html" %}

{% if metrics.open > 0 -%}
**{{ metrics.open }} task{{ "s are" if metrics.open != 1 else " is" }} still open from last week.**
{% endif %}
