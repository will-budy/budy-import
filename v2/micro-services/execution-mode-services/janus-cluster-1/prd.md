---
name: Janus Cluster — PRD
code: janus-cluster-1-prd
version: 0.3
status: in-review
last_updated: 2026-11-20
---

# Janus Cluster — Product Requirements

> **In review.** This describes what Janus does: connections, and the control of the outbound calls that Digital Teammate workflows make with them (checking each call, limiting how often it is made, and recording refusals). What is not yet covered is under Deferred Scope.

## Why This Exists

Digital Teammates (DTs) and the workflows that run for them need to act in customers' systems: read a calendar, call a business API. That takes credentials, and a credential must never sit in a prompt, a log, a workflow or a screen where the wrong person or a model could read it. Without a service that owns connections, each team collects secrets its own way, nobody can say who connected what or why, and a DT cannot tell what a tenant has already connected. A workflow that does act in a customer's system must be able to use only the connections it was published with, only within the vendor's limits, and leave a trail when it is refused. Janus is that service: it collects credentials safely, keeps them out of reach, tells DTs and people which connections exist, lets published workflows use exactly the connections they were granted, and keeps those calls inside the limits of the service they reach.

## What It Does

People and DTs ask Janus which kinds of connection are available, request a new connection with a reason, and finish it through a one-time link opened in a separate tab. Janus keeps the connection's details (which type, who made it, why, its state) and the credential itself in a separate, locked-down store that no screen or tool ever shows. Platform staff manage the catalogue of connection types in the console, set how often each service may be called, and see how connections are used; tenants see their own connections and how close each is to its limits.

When a published workflow runs, Janus lets its activities use the connections they were granted and nothing else. The workflow never holds the credential. A call that is not allowed is refused with a reason that is recorded; a call that goes over a service's limit is refused with the time to try again, and the workflow waits and retries.

## Who Uses It

| User | What they do |
| --- | --- |
| **Digital Teammates** | See which connection types exist and which connections the tenant has, request a missing one for the user, and tell the user to open the link. A DT never sees a credential. |
| **Tenant users** | Connect a service for their organisation from the console (or by following a link a DT gave them), and see their connections. |
| **Platform staff** | Manage the catalogue of connection types, their call limits and the limits of a single connection; see usage, live limit usage and refused outbound calls. Read-only unless they hold an editor session. |
| **Workflows** | Use the connections they were published with when they run, without ever holding a credential. A call outside what they were granted, or over a limit, is refused. |

## Phase 1 Scope

### Connection types

| Type | How it is connected | Named after |
| --- | --- | --- |
| Google Calendar | Sign in at the provider (hosted by Nango, with the platform's own verified Google app) | the type ("Google Calendar", "Google Calendar 2") |
| API key, Basic auth, Bearer token (any service) | A form: the user enters the credential and says which website it is for | the type and the website ("API key – welcomehome.com") |
| Service-specific API key types (for example Pipedrive, ClickUp, Linear, Postmark) | A form, with the service's website already known | the type ("Pipedrive (API token)") |

Platform staff can add more types, give each a description, retire one that should take no new connections, and delete one nothing uses.

### What a user experiences

- **Choosing a type.** A list of connection types, each with a plain description of what it gives access to. A DT sees the same list.
- **Requesting a connection.** The user (or the DT for the user) names the type and gives one sentence on why the connection is needed. For a type with no fixed website, the website is part of the request. The answer is a link and a message to pass on, valid for about an hour, usable once.
- **Finishing it.** The user opens the link in another tab. For an API key, basic or bearer connection they fill in a form; for Google Calendar they sign in with Google. A confirmation page says when it is done and they can close the tab; the connection then shows as active in the console.
- **Several connections of one type.** Connections are named automatically and numbered, so a tenant can hold two Google calendars or API keys for different websites and tell them apart. The reason is kept with each one.
- **Asking twice.** If the same user asks again within an hour for the same type (and website) while the first request is still waiting, they get the same pending connection with a message saying so, not a second one. They can explicitly ask for another connection of the same type, which leaves the pending one as it is.
- **Details that arrive later.** A connection can carry extra labels for display, for example the account it belongs to, shown in the console. They are never secrets.
- **The console.** Tenants see their connection types and connections, with when each was created, rotated and last used (last used is when a workflow last made an allowed call with it, and may lag by a few minutes; it reads "Never" until then). Platform staff see every type, which provider serves it, how many connections use it, and an audit of every catalogue change. The console has a sign out button and sends people back to the platform when their session ends.
- **Revoking.** An admin of a tenant can revoke a connection from its page. It stops working at once, its stored credential is destroyed and, for a connection held by the sign-in provider (Google Calendar), the connection is also removed there. If that last step does not finish the revoke still succeeds, the page says so, and revoking again retries it.
- **Connect from the console.** A user with an editor session can request a connection directly from the console, exactly as a DT would. A user with a view-only session sees the button disabled with the reason.

### Using connections from workflows

- **Only what was granted.** A workflow is published together with the connections each of its activities may use. When an activity calls the service behind a connection, Janus lets the call through only if that activity, in a run of that published workflow, was granted that connection. Any other call is refused with a short code and reason, and the workflow's activity fails with it.
- **No credential in the workflow.** Janus adds the credential to the call itself. The workflow's code, its logs and its history never contain it.
- **The right connection.** If an activity was granted two connections to the same service, the call says which one it means; without that it is refused rather than guessed, because the wrong account's credential must never be used.
- **Changes apply quickly.** Revoking or retiring a connection, or changing what a workflow was granted, applies to the next call and at the latest within about half a minute.
- **If Janus cannot decide, the call does not go through.** The activity fails and the workflow retries it.
- **Which workers.** Workflows run by TypeScript workers can use connections. A worker only gets this for the workflows published for it.

### Call limits

- **What a limit is.** Each connection type can carry a list of limits, set below the service's own so that Janus refuses first and can say exactly when to try again. A limit has a name, a number of calls and a window from one second to one day, and says what is counted: **per connection** (each connection has its own count) or **shared** (one count for every connection of the type, across tenants, for a quota the whole platform shares, such as our own Google project). A type can state both a short and a long window (for example per second and per day).
- **Lowering for one connection.** A platform editor can lower a per-connection limit for a single connection. It can never be raised above the type's limit. Shared limits cannot be lowered per connection.
- **What a refused call looks like.** A call over a limit is refused with the name of the limit and how many seconds to wait. The workflow's activity waits that long and retries by itself. If the service itself refuses a call because of its own limit, that refusal is passed to the workflow unchanged.
- **Checking usage.** On a connection's page a **Check current usage** button shows, for each limit, how much is used now ("80 of 100 calls per minute"), what is counted, whether the next call would be allowed or for how long it would be refused, and when the reading was taken. It reads once per press and never updates by itself. A tenant sees only their own connection and only its per-connection limits (a shared limit also counts other tenants' calls, so it is not shown). Platform staff, with any session, can open any connection by its id and see every limit including shared ones, and the tenant.
- **When counting is unavailable.** If the service that counts calls cannot be reached, calls are not refused for that reason: Janus applies each limit less exactly until it is back, and the usage view lists the limits without counts and says so.

### Outbound activity (platform staff)

- **What is recorded.** Every refused outbound call and every refused request for a run identity is recorded with the time, tenant, connection, workflow run, activity, the request (method, host and path) and the reason code. Repeated identical refusals in a short period are shown as one row with a count. Allowed calls are recorded only while a platform operator has switched on debugging capture. No credential, header, token or query string is ever recorded.
- **How long.** Refusals are kept for a short, configured time; allowed calls, when captured, for less.
- **The page.** Platform staff (any session) open **Outbound activity** and see the refusals across tenants, newest first, for the last 15 minutes to 24 hours or around a given time. They can filter by tenant or code, search by run or workflow id (so an error seen in a workflow run can be traced to the record), and see a summary of refusals by code and tenant. A refusal can take several minutes to appear. The page refreshes only when asked, or on a chosen interval, and says when a result was cut short. Tenants have no outbound activity page.

### What platform staff control

- **Types.** Create, edit, retire and delete connection types; give each a description; link a type to a provider and choose which provider serves new connections. Changing the provider affects new connections only and moves nothing; the console says so and asks the person to confirm.
- **Call limits.** Set, edit and remove the limits of each connection type, and lower a per-connection limit for one connection (from the Connection limits page, by connection id). A change to a type's limits adjusts any lowered connection limit that would now be above it.
- **Providers.** Visible but fixed: a new provider is a software change, not a console action.
- **Audit.** Every change to the catalogue, including call limits, is recorded with who made it and what changed.

## What Janus Is NOT Responsible For

- **Showing or exporting a credential**: nothing in Janus ever displays or returns a secret; credentials are write-only.
- **Signing people in and tenant roles**: the platform's authentication service owns it.
- **The external systems themselves**: their availability and their API limits.
- **Building and running the Digital Teammates' workers**: the nainai cluster and the build services own it.
- **Limiting how often the platform's public API is called**: the public API gateway owns inbound limits. Janus limits only calls that workflows make to the services behind connections.
- **A long-term record of every allowed call**: allowed calls are not kept by default and refusals are kept only for the retention above.
- **The service's own limits and answers**: Janus sets its limits below the service's, but a refusal by the service itself is passed on unchanged.
- **Deciding what a workflow should be granted**: the publishing service names the connections each activity uses; Janus enforces it.

## Success Criteria

| Metric | Target |
| --- | --- |
| A user can request a connection and finish it in another tab without help | Yes, for every supported type |
| No credential ever appears on a screen, in a log, in a DT's context or in a link | Zero occurrences (checked by tests of every route and log line) |
| A request made twice within an hour never leaves two waiting connections | 0 duplicates |
| Every connection says who created it and why | 100% of connections created after launch |
| Every catalogue change is attributable | 100% recorded with the person and the change |
| Connect page responds to the user's click | Proposed: within a few seconds at the 95th percentile; to be confirmed with product |
| A workflow's call to a connection it was not granted succeeds | Zero occurrences |
| A refused outbound call is recorded and findable by run id | 100% of refusals; proposed: visible on the Outbound activity page within about ten minutes, to be confirmed |
| A call refused for a limit tells the caller when to try again | 100% of limit refusals carry the wait |
| A workflow call succeeds with a connection after it was revoked | Zero calls succeed more than about half a minute after the revoke |

## Phase 1 UAT Acceptance Criteria

### Connections

| # | Scenario | Pass condition |
| --- | --- | --- |
| 1 | A user lists connection types in the console | Every active type shows its name and a description; retired types are marked and cannot be connected |
| 2 | A user requests an API key connection for a website with a reason | They receive a link; opening it shows a form; after saving, the connection is active and named "API key – <website>" |
| 3 | The same user requests the same type and website again within an hour, while the first is pending | They get the same pending connection with a message saying it already exists; no second connection appears |
| 4 | The same user asks for another connection of that type explicitly | A second pending connection is created and numbered ("… 2"); the first stays pending |
| 5 | A user requests two API keys for different websites | Both connections exist with different names showing each website |
| 6 | A user requests Google Calendar and completes the sign-in | The connection becomes active and shows as "Google Calendar" in the console |
| 7 | A request is made without a reason | It is refused with a message asking for one |
| 8 | A link is opened a second time, or after an hour | The page says the link is no longer valid and does not accept a credential |
| 9 | A DT is asked for a connection the tenant does not have | It requests one, passes the link and message to the user unchanged, and does not see any credential |
| 10 | A view-only user opens the connection types page | The Connect button is disabled with an explanation |
| 11 | A platform editor creates a type without a description | The save is refused with a message |
| 12 | A platform editor changes which provider serves a type | A warning explains that only new connections are affected and requires a confirmation |
| 13 | A platform editor deletes a type that has connections | It is refused and retiring is offered; deleting a type with none succeeds |
| 14 | Two editors change the same type at the same time | The second is told it changed and must reload; nothing is silently overwritten |
| 15 | A tenant user views their connections | They see only their organisation's connections, with created, rotated and last-used times and no secret |
| 16 | A user's session ends while the console is open | They get a two-minute notice, then are sent back to the platform; sign out does the same at once |
| 17 | Platform staff open the audit page | Every catalogue change shows who, when and what |
| 18 | The connection service is briefly unavailable | The user sees a clear "try again" message and no half-created connection is shown as active |

### Using connections from workflows (UAT)

| # | Scenario | Pass condition |
| --- | --- | --- |
| 19 | A published workflow's activity calls the service of a connection it was granted | The call succeeds with the credential applied, the workflow never sees the credential, and the connection's last-used time updates within a few minutes |
| 20 | An activity calls the service of a connection it was not granted | The call is refused with a code and reason, the activity fails with it, and the refusal appears on the Outbound activity page |
| 21 | A call is made without a run identity, or from a worker the publication does not name | It is refused and recorded; no credential is used |
| 22 | An admin revokes a connection while a workflow uses it | The next call is refused, within about half a minute at the latest |
| 23 | An activity is granted two connections to the same service and does not say which | The call is refused rather than guessed; naming one of the granted connections succeeds |
| 24 | Janus cannot reach what it needs to decide | The call does not go through, the activity fails, and the workflow retries it |
| 25 | Credentials and request details are searched for in the Outbound activity records, workflow histories and logs | No credential, token, header or query string is found |

### Call limits (UAT)

| # | Scenario | Pass condition |
| --- | --- | --- |
| 26 | A type has a per-connection limit of 3 calls per minute and a workflow makes a fourth call within the minute | The fourth call is refused with the limit's name and the seconds to wait; the workflow waits that long and the retry succeeds |
| 27 | Two connections of the same type each make 3 calls in a minute | Neither is limited: per-connection counts are separate |
| 28 | A type has a shared limit and calls come from connections of different tenants | The calls count together, and a call over the shared limit is refused for whichever tenant makes it |
| 29 | A platform editor lowers one connection's limit, then tries to raise it above the type's limit or to lower a shared limit | The lowered limit applies to that connection only; the raise and the shared-limit change are refused with a message |
| 30 | A platform editor changes a type's limit below a connection's lowered limit | The connection's lowered limit follows the new, lower figure, and the change is in the audit |
| 31 | A tenant user presses **Check current usage** on their connection | Each per-connection limit shows used and allowed calls, what is counted, whether the next call would be allowed or for how long it would be refused, and when it was read; shared limits are not shown |
| 32 | A tenant user asks for the usage of another tenant's connection, or of one that does not exist | The same "not found" answer in both cases |
| 33 | Platform staff, including a view-only session, open a connection by id and press **Check current usage** | Every limit including shared ones is shown, with the connection's tenant, type and state; a view-only session cannot change limits |
| 34 | The service that counts calls is unreachable | Calls are not refused because of it; the usage view lists the limits without counts and says so |
| 35 | A tenant session tries to open the Outbound activity page | It is refused |

### Outbound activity

| # | Scenario | Pass condition |
| --- | --- | --- |
| 36 | Platform staff open Outbound activity after a call was refused | The refusal is listed with time, tenant, connection, run, activity, request and code; filtering by the run id finds it; repeated identical refusals show as one row with a count |
| 37 | Platform staff open the page for a window that holds more records than can be shown | The page says the result was cut short and asks them to narrow the window |
| 38 | Outbound activity is opened where no record store is set up | The page says outbound activity is not configured |

## Phase 2 / Deferred Scope

- **Checking what a call contains** (which paths, methods and request contents a workflow may use on a service, for example deleting only records it owns): on the roadmap, not built yet. Today the grant of the connection to the activity is the decision.
- **Handing a credential to the activity for one call** instead of Janus adding it: not built; Janus adds it.
- **Types whose website varies by account** (for example a different subdomain per customer): not supported; a type names one website, a generic type takes one website per connection.
- **A tenant's own view of refused calls**: not built; only platform staff see Outbound activity.
- **Tenants lowering limits on their own connections**: not built; platform editors do it.
- **Renaming a connection** and **who fills in details such as the account label**: connections can carry them; nothing writes them yet.
- **Refreshing and re-authorising connections** (rotation, "needs sign-in again") and **a background retry of a provider-side deletion that failed at revoke** (today revoking again retries it): not built.
- **Expiring connections nobody finishes**: pending connections stay until used or revoked.
- **Janus's own Google sign-in** as an alternative to the hosted provider: later.
- **Moving connections between providers**: deliberately not built; new connections use the active provider.
- **Sharing a connection** beyond the creator and the DT it serves (and its manager): out of scope.

## Open Questions

- Whether tenants should see their own refused calls, and whether tenant editors may lower limits for their own connections (today platform staff only).
- The figures of the limits shipped with some types were set from the vendors' published numbers in November 2026 and are to be checked against each vendor.
- Whether workflows run by Go workers should use connections too (today only TypeScript workers do).
- Whether a view-only user may ever request a connection (today an editor session is required).
- Targets for connect-page responsiveness and how many connections per tenant to plan for.
