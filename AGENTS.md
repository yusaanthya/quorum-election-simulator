# Agent instructions

## Design documents live in this repository

This is a personal project, so specs and task plans go under `docs/`, not into
the separate plans repository. This overrides the convergent-spec and
convergent-impl defaults.

- **convergent-spec**: do not publish into `$PLANS_DIR`. Copy each converged
  draft to `docs/<topic>/<date>-<topic>-spec.md` or
  `docs/<topic>/<date>-<topic>-plan.md` (the names `convergent-publish` would
  use), and copy the run's `requirements.md` to
  `docs/<topic>/<date>-<topic>-requirements.md`, since its scratch copy is
  temporary. `docs/sim-clock/` is the example.
- **convergent-impl**: always pass the plan path in `docs/` explicitly.
  Without one, the skill picks the newest plan in the plans repository.
- **Local paths**: the repository is public. Before committing a document,
  replace absolute paths that reveal the local account (`/home/<user>/...`)
  with repo-relative paths, `~/...`, or a neutral description.
