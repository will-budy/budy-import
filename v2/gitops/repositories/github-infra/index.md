# Repository: github-infra

Local path: `/Users/samaykohli/GitHub/abb-gitops-repos/github-infra/v1`

## Ownership

This Terraform repository is the source of truth for all Budybot GitHub repositories, including application, GitOps, infrastructure, and miscellaneous repositories. Repositories created historically in the GitHub UI must be declared and imported before Terraform applies them.

## Relevant layout

```text
v1/stacks/
  users-teams/v1/
  org-rules/v1/
  repos/
    modules/{app-repo,gitops-repo,infra-repo}/v1/
    repos-applications/{thinking-mode,muscle-memory-mode,shared-apps}/v1/
    repos-gitops/v1/
    infra-repos/v1/
    misc-repos/v1/
```

Standard repositories are entries in `standard-repos-declare.tf` and are instantiated by `standard-repos-main.tf`. Use a repo-specific `<name>-repo.tf` only when settings differ from the group defaults.

## New application work

1. Classify the app as thinking mode, muscle-memory/execution, or shared.
2. Add its name and description to that stack's `standard-repos-declare.tf`, unless it needs custom settings.
3. Confirm team access, branch protection, Actions variables, and default branch settings produced by `app-repo/v1`.
4. For a legacy UI-created repo, import the repository and branch protection before apply; require a no-op or intentionally additive plan.
5. Run `terraform init -backend=false` and `terraform validate`; use the PR workflow for the real plan/apply.

## Guardrails

- Do not create a repository in the UI as the normal path.
- Repository resources use `prevent_destroy`; do not work around it.
- Keep plan and apply GitHub Apps/credentials separate.
- Reuse existing modules/direct resources; create a new custom module only at the third use.

## Application initialization

There is no canonical application source template today. Create new Go application repositories from scratch with the GitHub `Go` `.gitignore`, and use Context Cluster/LLM Router as layout references without copying their history or application configuration. The current mandatory CI/CD variable and secret contract is documented in [Application Cluster CI/CD Standard](../../application-cicd-standard.md).
