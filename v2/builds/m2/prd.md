# Mark 2 Overall — Product Requirements

|                  |                                                                          |
| ---------------- | ------------------------------------------------------------------------ |
| **Document**     | Product Requirement Doc                                                  |
| **Version**      | 0.1                                                                      |
| **Status**       | Living Document                                                          |
| **Audience**     | Internal Team                                                            |
| **Purpose**      | Defines what is the first customer deliverable product we are delivering |
| **Last Updated** | May 2026                                                                 |

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Naming](#system-naming)
3. [Problem](#problem)
4. [UAT](#uat)
5. [Users](#users)
6. [Workflows](#workflows)
7. [DT having a Clarification Behavior](#dt-having-a-clarification-behavior-used-for-prompt-designing)
8. [Agent Success Dashboards/Queues](#agent-success-dashboardsqueues)
9. [Mark 2 Scope](#mark-2-scope)
10. [Out of Scope](#out-of-scope)
11. [Open Questions](#open-questions)

## Executive Summary

Mark 2 is the next evolution of the Digital Teammate (DT) product (currently focused on the Reporting missions).

The current production system is Mark 1. In Mark 1, report generation exists, but meaningful report changes still depend on a consultant manually driving the redesign process across tools, AI assistants, implementation surfaces, and review loops.

Today, the time required to update a report depends on the complexity of the change: simple fixes may take less than a week, section modifications can take around two weeks, and new sections or analytical views can take up to four weeks.

Thinking Mode is the replacement for the consultant workflow. It should let a manager explain report changes directly to the DT, help the DT reason through the requested change, generate and verify a revised report draft, route it through Agent Success review, collect manager approval, and publish the approved change to Muscle Memory Mode.

Mark 2 focuses on report modification workflows for existing weekly HTML reports across individual, regional, and global stakeholder views.

The goal of Mark 2 is not to make consultants faster. The goal is to remove the consultant as a required user in the standard report customization workflow and let managers iterate on reports while their intent is still fresh, without needing a consultant to translate, coordinate, or execute the change.

## System Naming

Mark 2 introduces clearer names for the two internal systems behind the Digital Teammate.

What we used to call the **Design System** in Mark 1 becomes the **Thinking Mode System** after Mark 2.

The Thinking Mode System includes the old Design System services plus the new services required for manager interaction, reasoning, draft generation, clarification, review coordination, and report redesign.

What we used to call the **Execution System** in Mark 1 becomes the **Muscle Memory Mode System** after Mark 2.

The Muscle Memory Mode System is responsible for running approved, stable workflows predictably. Thinking Mode designs or modifies how the work should be done; Muscle Memory Mode executes the approved work.

## Problem

Today, in Mark 1, report changes depend on a consultant manually driving the entire workflow across multiple tools and interfaces.

The consultant has to understand the manager request, rebuild context on the current report, inspect the existing implementation, work with AI tools, make changes, generate samples, test the output, debug issues, and repeat until the result is acceptable.

This creates three practical problems:

1. **The work requires too much uninterrupted context**

   Report modification work is hard to do in short gaps between manager calls and other operational work.

   If a consultant cannot finish the work in one sitting, they have to spend time rebuilding context when they come back to it. Because of this, consultants either wait for a long continuous work block or lose time repeatedly reloading the same context.

2. **Consultant capacity becomes the bottleneck**

   In practice, a consultant can only make meaningful changes for one to two managers per week, or sometimes only two to three managers over a month, depending on the size of the requests.

   This is not a scalable operating model. We do not want to become a people-heavy consulting service, and we do not want one of the most important manager value loops to depend on consultant availability.

3. **Manager intent and iteration get lost**

   The bigger issue is not only the cost of consultant time. The bigger issue is that putting a human translation layer between the manager and the product slows down creativity.

   When a manager asks for a report change, they are usually reacting to a real business problem they are facing right now. If the change takes three to four weeks, the original intent can get diluted, the problem may no longer be urgent, the manager may find another workaround, or the request may lose momentum entirely.

   Long delivery cycles also prevent healthy iteration. Reports and manager-facing features usually get better through fast feedback loops: try a version, react to it, adjust it, and repeat. When each cycle takes weeks, managers do not iterate enough to get to the report they actually want.

   We also do not want to make iteration instant or chat-speed. If changes happen in a few minutes, managers may turn passing thoughts into recurring report changes when they should really be one-time data requests. The DT also needs enough time to think, reflect, test, and verify before changing a report that will run repeatedly.

## UAT

1. A manager is able to get micro changes to existing sections (i.e  grammatical changes )done in 4 hrs from request.
2. A manager is able to get a major changes to existing sections (i.e  change in ingestion data logic, change logic that needs thinking ) done in 3 Days from request. (assuming the manager is available to give feedback in )
3. A manager is able to add a new section to the report in 7 days from request. (assumes 2 revisions)
4. Answers email queries to teammmate email address and suggestion back from Teammates ( goal is that it acknowledges and clarifies if it can but does not do much in the sense of i am taking your feedback and doing something about it. That is not in scope) within 4 hrs. Saving it to feedbacks recieved is the real scope.
5. Allow a AgentSuccess rep to query meeting transcript ( memories) and query directory questions through a UI . (Allow a AgentSuccess rep to login and assume identity of a digital Teammate and access the context cluster through UI. Capability is suppose to be very choppy and broken but working in mark 2 :) ) ( write will be introduced in Mark 3 along with delegation tags i.e its recorded that XX did YY on behalf of Z DT)
6. Allow Managers to snooze teammates from getting weekly tasks for upto a max of 4 weeks based on an email request. ( this will be for teammates managed by a requesting manager).

## Users

### Primary User: Manager

The manager is the person asking for report changes.

They need to:

- explain what they want changed in natural language
- see whether the DT understood the requested change correctly
- review report mocks before changes are finalized
- give feedback without having to translate their business need into implementation instructions
- approve when the updated report should go live

### Secondary User: Agent Success Rep

The Agent Success rep is the human review layer for Mark 2.

They need to:

- receive clear review requests from the DT
- understand what the manager asked for
- inspect the proposed report change and draft output
- provide feedback or approval in a deterministic way
- avoid live back-and-forth with the DT for the current build

## Workflows

Mark 2 should make report customization a direct, guided workflow between a manager and a Digital Teammate (DT), instead of a fragmented consultant-driven process across multiple tools.

Mark 2 is successful when Thinking Mode can run the standard report customization workflow without a consultant as a required user. The product outcome is that managers can iterate on reports while their intent is still fresh, Thinking Mode replaces the consultant execution workflow, and report changes move from manual coordination to a guided DT workflow.

The release is ready when the following workflow can happen end to end:

| #   | Stage                             | Manager                                                                                                                                                                                                                                                                                                                                                                                                                                           | Digital Teammate                                                                                                                                                                                                                                                                                                                                                                                                     | Agent Success Rep                                                                                                                                                                                                                                                                                   | Outputs                                                                                                                                                                      | Pass condition                                                                                                                                                                                  |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Manager request intake            | Sends a DT an email requesting a change to a report which the DT can either do or request for the manager to send them an meeting invite as below to get more details.<br><br>OR<br><br>Sends the DT a calendar invite with a Teams video call link. Explains the requested report change in natural language during the call, gives rationale, constraints, and feedback by voice, and confirms whether the DT understood the request correctly. | Uses the calendar invite title and body as possible starting context. Joins the Teams call with audio, video, and one-way screen sharing. Captures the requested changes, rationale, constraints, and feedback. Asks clarifying questions when the request is ambiguous, incomplete, or internally inconsistent.                                                                                                     | No role in intake.                                                                                                                                                                                                                                                                                  | Intake summary. Clarification log.                                                                                                                                           | A manager can invite the DT to a Teams call, and the DT can use the invite context, join the call, capture the request, ask clarifying questions, and confirm understanding.                    |
| 2   | Live visual confirmation          | Reviews live report mocks during the intake call and gives voice feedback. Chat-based feedback is not supported in Mark 2.                                                                                                                                                                                                                                                                                                                        | Loads the HTML report in a browser-like environment, makes visible changes while sharing a one-way video stream, and uses the manager's feedback to correct its understanding. Before the call ends, summarizes the agreed next steps and schedules a follow-up manager review call for the next working day or another manager-approved time.                                                                       | No role in live visual confirmation.                                                                                                                                                                                                                                                                | Live mock summary, including screenshots or a record of the visual direction confirmed during the intake call.                                                               | The DT can share a one-way live HTML report mock, make visible changes during the call, and use voice feedback to correct its understanding.                                                    |
| 3   | Draft generation and verification | Waits for the revised draft instead of expecting instant generation during the intake call.                                                                                                                                                                                                                                                                                                                                                       | Uses the manager's stated requirements, call context, and current report context to generate a revised HTML report draft. Visually verifies the draft before sending it for human review. The DT should have enough time to reason, reflect, test, and improve the draft.                                                                                                                                            | No role before review request.                                                                                                                                                                                                                                                                      | Draft report. Visual verification result summarizing the LLM review cycle for readability, obvious layout issues, missing required sections, and readiness for human review. | The DT can generate a revised HTML report draft and run an LLM visual review for readability, layout quality, missing sections, and human review readiness.                                     |
| 4   | Agent Success review              | No review action before Agent Success approves or gives feedback.                                                                                                                                                                                                                                                                                                                                                                                 | Sends every Mark 2 change request to Agent Success before manager review. Creates an Agent Success review request through Jira Service Desk, either by API-created ticket or email-created ticket. The request includes the manager's ask, proposed change, draft report, assumptions, open concerns, and requested feedback or approval.                                                                            | Reviews the request asynchronously, inspects the proposed report change and draft output, and provides feedback or approval through a deterministic Jira-supported action such as an approval button or status transition. There is no live interaction between the DT and Agent Success in Mark 2. | Agent Success review request. Agent Success approval or feedback.                                                                                                            | Every change request creates a Jira Service Desk review request with the manager ask, draft report, assumptions, and a deterministic approval or feedback path.                                 |
| 5   | Manager review                    | Reviews the pre-read before the meeting when possible. If the manager approves before the meeting, the call may not be needed. If the manager does not approve in advance, they join the review call, review the updated report visually, and give feedback or approval.                                                                                                                                                                          | Sends a manager pre-read before the review meeting with context, changes made, any decision needed, and a copy of the revised HTML report. Joins the review call when needed with Teams audio, video, and one-way screen sharing, shows the updated report visually, collects manager feedback or approval, and confirms whether to proceed or iterate again. Supports up to three revision loops before escalating. | No live role in manager review unless the workflow has returned to Agent Success after a revision.                                                                                                                                                                                                  | Manager pre-read. Manager feedback or approval.                                                                                                                              | The DT sends a pre-read with a cover email and revised HTML report, then captures manager approval or feedback before publishing. The DT supports up to three revision loops before escalating. |
| 6   | Publish                           | Approves when the updated report should go live.                                                                                                                                                                                                                                                                                                                                                                                                  | Publishes manager-approved changes to Muscle Memory Mode for the next eligible reporting cycle, assuming the publish cutoff is met.                                                                                                                                                                                                                                                                                  | No role after manager approval.                                                                                                                                                                                                                                                                     | Publish confirmation recording that the approved change was published to Muscle Memory Mode and which reporting cycle it will affect.                                        | Approved changes are published to Muscle Memory Mode for the next eligible reporting cycle, assuming the 24-hour cutoff is met.                                                                 |

Managers should be able to complete the intake, review, and approval loop without translating their request into technical instructions or depending on consultant execution.

## DT having a Clarification Behavior (used for prompt designing)

The DT should clarify when it does not have enough information to make a report change that matches the manager's intent.

The DT should ask clarifying questions when:

- the requested metric, section, audience, or time period is unclear
- the manager asks for a visual or layout change but the desired outcome is ambiguous
- the request could be interpreted in multiple ways
- the requested change conflicts with the current report structure
- the DT cannot tell whether the manager wants a report change or a one-time data answer

When the DT is unsure whether the request should become a recurring report change, it should ask: "Would this be a one-time or recurring need?"

The DT should show a live mock when a visual confirmation would reduce ambiguity.

The DT should not treat every passing idea as a report change. If the manager appears to be exploring a temporary question or one-time analysis, the DT should clarify whether this should become a recurring report change.

The DT should end the intake call by summarizing:

- what it understood
- what it plans to change
- what assumptions it is making
- what will be reviewed by Agent Success
- when the manager will see the draft

## Agent Success Dashboards/Queues

Agent Success needs a Jira Service Desk dashboard or set of queues that makes it clear where each report change request is, who owns the next action, and which tickets need human attention.

The dashboard should separate tickets by current actor:

- **Owned by Agent Success Rep**: tickets where a human needs to review a draft, approve a change, provide feedback, resolve an escalation, or decide whether the workflow should continue.
- **Owned by Digital Teammate**: tickets where the DT is generating a draft, applying Agent Success feedback, preparing a manager pre-read, publishing an approved change, or otherwise taking the next automated step.
- **Waiting on Customer**: tickets where the manager needs to answer clarification questions, review a pre-read, approve a draft, or provide feedback after a review call.

The queues should also expose status and escalation type so Agent Success can prioritize work without reading every ticket in detail:

- **Waiting review before sending to customer**: the DT has created a draft and needs Agent Success approval before the manager sees it.
- **Clarification questions needed**: the DT cannot proceed because the manager request is ambiguous, incomplete, internally inconsistent, or may be a one-time data request instead of a recurring report change.
- **Teammate errored out**: the DT failed during intake processing, draft generation, visual verification, pre-read creation, publishing, or another automated step.
- **Agent Success feedback returned**: Agent Success has requested changes and the ticket is waiting for the DT to revise the draft.
- **Waiting on manager approval**: the manager has the pre-read or reviewed draft and needs to approve or provide feedback.
- **Escalated**: the workflow exceeded the supported revision loop, missed the publish cutoff, hit an unresolved system issue, or needs a human decision before continuing.

Each ticket should show the manager ask, current owner, current status, proposed change, draft or artifact links, assumptions, open concerns, due date or reporting cycle, and the next expected action.

## Mark 2 Scope

Mark 2 is scoped to manager-requested changes for existing weekly HTML reports.

Included in Mark 2:

- managers can invite a DT to a Teams video call through a calendar invite
- the DT can use the calendar invite title and body as initial context for the call
- managers can explain report changes directly to the DT
- the DT can ask clarifying questions during the call
- the DT can use Teams audio, video, and one-way screen sharing during the call
- the DT can show live HTML report mocks during the call by loading and modifying the report in a browser-like environment
- the DT can summarize what it plans to do next before ending the call
- the DT can schedule a follow-up review call based on manager availability
- the DT can use call context and existing report context to generate a revised draft report
- the DT can visually verify the generated report draft before sending it for review
- every change request goes through Agent Success review before manager review
- the DT can raise a Jira Service Desk ticket or email-style review request for Agent Success
- Agent Success can either approve the ticket or provide feedback for the DT to fix before returning for another review
- the DT can send a manager pre-read before the review meeting
- the DT can collect manager feedback or approval
- the DT can publish approved changes to Muscle Memory Mode for the next eligible reporting cycle

## Out of Scope

The following are out of scope for Mark 2:

- fully replacing Agent Success review
- building a DT confidence framework to decide which changes need Agent Success review
- live interaction between the DT and Agent Success reps
- instant report generation and deployment during the initial manager call
- supporting arbitrary new products beyond existing weekly HTML reports
- replacing manager approval before publishing changes
- using this workflow for one-time data questions that should not become recurring report changes
- deploying report changes less than 24 hours before the next reporting cycle unless explicitly supported by the Muscle Memory Mode System
- removing Budy internal support from every edge case or escalation

## Open Questions

Open product questions to refine through PRD and prototype iteration:

- What exact fields should the Agent Success Jira ticket include?
- What exact wording and layout should the manager pre-read use?
- What short visual quality checklist should the LLM review run against?
- What escalation path should happen after three failed revision loops?
