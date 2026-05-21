#!/usr/bin/env bash
# Enforces the Clean Architecture inward dependency rule:
# - Domain cannot import Application, Infrastructure, or Interfaces.
# - Application cannot import Infrastructure or Interfaces.
# - Infrastructure cannot import Interfaces.

echo "[Antigravity Hook] Validating architectural dependencies..."

# Get modified typescript files via git if we are inside a git repo
MODIFIED_FILES=$(git diff --cached --name-only | grep -E '\.ts$|\.tsx$')

if [ -z "$MODIFIED_FILES" ]; then
  # If no staged changes, check all modified files
  MODIFIED_FILES=$(git diff --name-only | grep -E '\.ts$|\.tsx$')
fi

VIOLATIONS=0

for file in $MODIFIED_FILES; do
  if [ -f "$file" ]; then
    # Check if the file is in a domain directory
    if [[ "$file" =~ /domain/ ]]; then
      # Domain cannot import application, infrastructure, or interfaces
      if grep -E "from ['\"](\.\./)*application" "$file" >/dev/null || \
         grep -E "from ['\"](\.\./)*infrastructure" "$file" >/dev/null || \
         grep -E "from ['\"](\.\./)*interfaces" "$file" >/dev/null; then
        echo "❌ [VIOLATION] Domain layer file '$file' is importing from a outer layer!"
        VIOLATIONS=$((VIOLATIONS + 1))
      fi
    fi

    # Check if the file is in an application directory
    if [[ "$file" =~ /application/ ]]; then
      # Application cannot import infrastructure or interfaces
      if grep -E "from ['\"](\.\./)*infrastructure" "$file" >/dev/null || \
         grep -E "from ['\"](\.\./)*interfaces" "$file" >/dev/null; then
        echo "❌ [VIOLATION] Application layer file '$file' is importing from a outer layer!"
        VIOLATIONS=$((VIOLATIONS + 1))
      fi
    fi
  fi
done

if [ $VIOLATIONS -gt 0 ]; then
  echo "❌ Dependency validation failed. Please adhere to the inward dependency rules."
  exit 1
fi

echo "✅ Architectural dependencies are correct."
exit 0
