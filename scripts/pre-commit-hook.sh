#!/bin/sh
#
# pre-commit hook — runs TypeScript typecheck before allowing commits.
# Install: this file is already in .git/hooks/ and is executable.
# Skip:    git commit --no-verify
#

echo "🔍 Running TypeScript typecheck..."

# Run tsc --noEmit and capture output
OUTPUT=$(npx tsc --noEmit 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    echo "❌ TypeScript errors found! Commit blocked."
    echo ""
    echo "Fix the errors below, then try committing again:"
    echo "──────────────────────────────────────────────"
    echo "$OUTPUT" | head -50
    TOTAL=$(echo "$OUTPUT" | wc -l)
    if [ "$TOTAL" -gt 50 ]; then
        echo "  ... and $((TOTAL - 50)) more lines"
    fi
    echo "──────────────────────────────────────────────"
    echo ""
    echo "💡 Tip: Run 'npx tsc --noEmit' to see all errors"
    echo "💡 Tip: Skip this check with 'git commit --no-verify' (not recommended)"
    exit 1
fi

echo "✅ TypeScript check passed"
exit 0
