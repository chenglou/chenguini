# Template Prompt

Use this when you want an AI worker to build from template code instead of only from prose docs.

```md
You are working in this repo.

Read these first:

1. `docs/drafts/verification.md`
2. the task spec
3. `todos/demo_templates/README.md`
4. the template folders named below

Allowed template sources:

- `todos/demo_templates/reference-app`
- `todos/demo_templates/gesture-stack`

Default rule:

- start from `reference-app`
- only pull from `gesture-stack` if the interaction needs drag, flick, release settle, or special depth during motion

Copy the smallest complete slice that works, then trim. Put static facts beside pure geometry helpers when the task has static layout truth.

Do not invent a fresh architecture if one of the template slices already fits.

Do not inspect unrelated demos unless the task explicitly allows them.

Add static layout facts where relevant, then implement and validate.
```

If the worker drifts, tighten the prompt with concrete extraction guidance like:

- "Keep `scheduleRender`, `st.events`, and end-of-render side effects together."
- "Keep pointer history, release velocity, and `lastDragged` depth together."
- "Keep product truth in source-owned helpers where possible. Do not move layout truth into a runner."
