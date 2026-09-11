#!/usr/bin/env bash
set -euo pipefail

repo="${GH_REPO:-$(gh repo view --json nameWithOwner --jq '.nameWithOwner')}"
pr_number="${1:-$(gh pr view --json number --jq '.number')}"
owner="${repo%%/*}"
name="${repo#*/}"

gh api graphql \
  -f owner="$owner" \
  -f name="$name" \
  -F number="$pr_number" \
  -f query='query($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            isOutdated
            path
            line
            originalLine
            comments(first: 100) {
              nodes {
                databaseId
                author { login }
                body
                url
              }
            }
          }
        }
      }
    }
  }' \
  --jq '
    .data.repository.pullRequest.reviewThreads.nodes
    | map(select(.isResolved | not))
    | if length == 0 then
        "No unresolved review threads"
      else
        .[]
        | "THREAD \(.id)\nFILE \(.path):\(.line // .originalLine // 0)\nOUTDATED \(.isOutdated)\n"
          + (.comments.nodes
             | map("COMMENT \(.databaseId) @\(.author.login)\n\(.body)\n\(.url)")
             | join("\n\n"))
          + "\n---"
      end
  '
