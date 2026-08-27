#!/usr/bin/env bash
#
# Assembles everything that gets published: the latest docs at the root, and a
# frozen copy of the docs for every release under its own version number.
#
#   https://sebs.github.io/gurkencheck/rules/no-restricted-tags.html
#   https://sebs.github.io/gurkencheck/0.0.5/rules/no-restricted-tags.html
#   https://sebs.github.io/gurkencheck/0.0.4/rules/no-restricted-tags.html
#
# A GitHub Pages deployment replaces the whole site rather than adding to it,
# so every deployment has to produce every version. Each release is built from
# its own tag, so its docs describe the rules that release actually shipped
# rather than the ones master has since grown.
#
#   ./scripts/build-site.sh [output directory]
set -euo pipefail

output="${1:-_site}"

# Newest first, which is the order the version picker lists them in.
tags=()
while IFS= read -r tag; do
  [ -n "$tag" ] && tags+=("$tag")
done < <(git tag --list 'v*' --sort=-v:refname)

versions=()
for tag in ${tags[@]+"${tags[@]}"}; do
  versions+=("${tag#v}")
done
published="${versions[*]-}"

echo "Publishing the latest docs, and ${#versions[@]} released versions: ${published:-none}"

rm -rf "$output"

# The latest docs, from whatever is checked out.
DOCS_LATEST=true DOCS_PUBLISHED="$published" npm run docs
mv docs "$output"

for tag in ${tags[@]+"${tags[@]}"}; do
  version="${tag#v}"
  worktree="$(mktemp -d)"

  # A worktree rather than a checkout, so the tree this script was started
  # from is left exactly as it was.
  git worktree add --detach --quiet "$worktree" "$tag"

  (
    cd "$worktree"
    # --ignore-scripts skips the prepare hook, which compiles the package:
    # the docs are generated straight from the TypeScript sources.
    npm ci --ignore-scripts --silent
    DOCS_VERSION="$version" DOCS_LATEST=false DOCS_PUBLISHED="$published" npm run docs
  )

  mv "$worktree/docs" "$output/$version"
  git worktree remove --force "$worktree"

  # Releases tagged before the generator wrote canonical links get them here.
  node scripts/canonicalise-docs.ts "$output/$version" "$version"
done

echo "Assembled $(find "$output" -name '*.html' | wc -l | tr -d ' ') pages into $output/"
