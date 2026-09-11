#!/usr/bin/env bash
set -euo pipefail

repo="${GH_REPO:-$(gh repo view --json nameWithOwner --jq '.nameWithOwner')}"
pr_number="${1:-$(gh pr view --json number --jq '.number')}"
owner="${repo%%/*}"
name="${repo#*/}"

query='query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
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
}'

nodes='[]'
cursor=''
has_next='true'

while [[ "$has_next" == "true" ]]; do
  args=(
    api graphql
    -f owner="$owner"
    -f name="$name"
    -F number="$pr_number"
    -f query="$query"
  )
  if [[ -n "$cursor" ]]; then
    args+=(-f cursor="$cursor")
  fi

  page="$(gh "${args[@]}" --jq '.data.repository.pullRequest.reviewThreads')"
  nodes="$(jq -c --argjson page "$page" '. + $page.nodes' <<<"$nodes")"
  has_next="$(jq -r '.pageInfo.hasNextPage' <<<"$page")"
  next_cursor="$(jq -r '.pageInfo.endCursor // empty' <<<"$page")"
  if [[ "$has_next" == "true" && ( -z "$next_cursor" || "$next_cursor" == "$cursor" ) ]]; then
    echo "reviewThreads pagination did not advance" >&2
    exit 1
  fi
  cursor="$next_cursor"
done

jq -r '
  map(select(.isResolved | not))
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
' <<<"$nodes"
