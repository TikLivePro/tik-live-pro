#!/usr/bin/env bash
# ==============================================================================
# .agents/scripts/validate-dependencies.sh
#
# Validates the Clean Architecture inward dependency rule on TypeScript files.
#
# Rules enforced:
#   - domain/    cannot import from application/, infrastructure/, or interfaces/
#   - application/ cannot import from infrastructure/ or interfaces/
#   - infrastructure/ cannot import from interfaces/
#
# Usage:
#   # Check staged (pre-commit) files:
#   bash .agents/scripts/validate-dependencies.sh
#
#   # Check all modified (unstaged) files:
#   STAGED=0 bash .agents/scripts/validate-dependencies.sh
#
#   # Check ALL TypeScript files in the repo (full audit):
#   FULL=1 bash .agents/scripts/validate-dependencies.sh
#
# Exit codes:
#   0 — no violations
#   1 — one or more violations found
# ==============================================================================

set -euo pipefail

echo "[Antigravity] Validating Clean Architecture dependencies…"
echo ""

# ── Determine file set ────────────────────────────────────────────────────────
if [[ "${FULL:-0}" == "1" ]]; then
  MODIFIED_FILES=$(git ls-files --cached --others --exclude-standard \
    | grep -E '\.(ts|tsx)$' || true)
else
  # Staged files (pre-commit hook)
  MODIFIED_FILES=$(git diff --cached --name-only | grep -E '\.(ts|tsx)$' || true)

  if [[ -z "${MODIFIED_FILES}" ]] || [[ "${STAGED:-1}" == "0" ]]; then
    # Fall back to unstaged modified files
    MODIFIED_FILES=$(git diff --name-only | grep -E '\.(ts|tsx)$' || true)
  fi
fi

if [[ -z "${MODIFIED_FILES}" ]]; then
  echo "  No TypeScript files to check."
  echo ""
  echo "✅ No violations found."
  exit 0
fi

VIOLATIONS=0

# ── Check each file ──────────────────────────────────────────────────────────
for file in ${MODIFIED_FILES}; do
  [[ -f "${file}" ]] || continue

  # ── domain/ ────────────────────────────────────────────────────────────────
  # Domain cannot import application, infrastructure, or interfaces
  if [[ "${file}" =~ /domain/ ]]; then
    for outer in application infrastructure interfaces; do
      if grep -qE "from ['\"](\.\./)*${outer}" "${file}" 2>/dev/null; then
        echo "  ❌ [VIOLATION] domain/ → ${outer}/"
        echo "     File: ${file}"
        echo "     Domain must not depend on outer layers."
        echo ""
        VIOLATIONS=$((VIOLATIONS + 1))
      fi
    done
  fi

  # ── application/ ───────────────────────────────────────────────────────────
  # Application cannot import infrastructure or interfaces
  if [[ "${file}" =~ /application/ ]]; then
    for outer in infrastructure interfaces; do
      if grep -qE "from ['\"](\.\./)*${outer}" "${file}" 2>/dev/null; then
        echo "  ❌ [VIOLATION] application/ → ${outer}/"
        echo "     File: ${file}"
        echo "     Application must not depend on outer layers."
        echo ""
        VIOLATIONS=$((VIOLATIONS + 1))
      fi
    done
  fi

  # ── infrastructure/ ─────────────────────────────────────────────────────────
  # Infrastructure cannot import interfaces
  if [[ "${file}" =~ /infrastructure/ ]]; then
    if grep -qE "from ['\"](\.\./)*interfaces" "${file}" 2>/dev/null; then
      echo "  ❌ [VIOLATION] infrastructure/ → interfaces/"
      echo "     File: ${file}"
      echo "     Infrastructure must not depend on the interfaces layer."
      echo ""
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  fi

  # ── Cross-service imports ────────────────────────────────────────────────────
  # Services must not import directly from other service src/ directories.
  # They may only use shared packages (@tik-live-pro/*).
  if [[ "${file}" =~ ^services/([^/]+)/ ]]; then
    current_service="${BASH_REMATCH[1]}"
    if grep -qE "from ['\"](\.\./)+services/(?!${current_service})" "${file}" 2>/dev/null; then
      echo "  ❌ [VIOLATION] Cross-service direct import detected"
      echo "     File: ${file}"
      echo "     Services must communicate via NATS events or the API Gateway,"
      echo "     not by importing each other's source code."
      echo ""
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  fi

  # ── 'any' type usage ─────────────────────────────────────────────────────────
  # The 'any' type is banned — use 'unknown' and narrow with guards.
  # Ignores comments and type cast 'as any' in test files.
  if [[ ! "${file}" =~ \.(test|spec)\.(ts|tsx)$ ]]; then
    any_count=$(grep -cE ':\s*any\b|<any>' "${file}" 2>/dev/null || true)
    if [[ "${any_count}" -gt 0 ]]; then
      echo "  ⚠️  [WARNING] 'any' type usage (${any_count} occurrence(s))"
      echo "     File: ${file}"
      echo "     Use 'unknown' + type guards or Zod schemas instead."
      echo ""
    fi
  fi
done

# ── Summary ───────────────────────────────────────────────────────────────────
if [[ "${VIOLATIONS}" -gt 0 ]]; then
  echo "❌ Dependency validation FAILED — ${VIOLATIONS} violation(s) found."
  echo "   Fix the violations above before committing."
  exit 1
fi

echo "✅ Architectural dependencies are valid."
exit 0
