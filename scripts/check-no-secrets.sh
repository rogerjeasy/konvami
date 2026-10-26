#!/bin/sh
# Fails when a secret-bearing file is tracked or staged in git: env files, Terraform state/vars/plans,
# signing keys, Firebase service-account keys and app configs. Only *.example files may be committed. Used by CI and the local pre-commit hook.
set -eu

files=$( (git ls-files; git diff --cached --name-only --diff-filter=ACMR) | sort -u)
bad=$(printf '%s\n' "$files" |
  grep -E '(^|/)\.env($|\.)|\.tfvars$|\.tfstate|(^|/)tfplan$|\.(p8|p12|pem|key|jks|mobileprovision|secret|secrets)$|firebase-adminsdk[^/]*\.json$|(^|/)(google-services\.json|GoogleService-Info\.plist)$' |
  grep -vE '\.env\.example$|\.tfvars\.example$' || true)

if [ -n "$bad" ]; then
  echo "These files must never be committed (keep them local, commit a *.example instead):"
  echo "$bad"
  exit 1
fi
