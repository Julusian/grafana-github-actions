# Grafana Github Actions Builds bridge

This projects monitors builds for specified projects in Github Actions, storing the status into a mysql database for consumption in grafana.

## Example query

```sql
SELECT
  concat(owner, "/", repo, " (", workflowName, ")") as Project,
  concat(commitRef, " (", substring(commitSha, 1, 8), ")") as Ref,
  CONVERT(state, SIGNED) as State,
  stateMessage as Failed,
  TIMEDIFF(IFNULL(finished, NOW()), started) as Duration,
  created
FROM github_actions_builds
WHERE (created >= $__timeFrom() AND (created <= $__timeTo() OR finished <= $__timeTo() OR finished IS NULL))
ORDER BY created DESC
LIMIT 50

```

## Installation

Ensure you have a running mysql server

Define the following environment variables, updating for your setup as appropriate:

1. `MYSQL_URL` eg `mysql://USERNAME:PASSWORD@HOST/DATABASE`
1. `PROJECTS` A comma separated list of projects to monitor eg `julusian/node-elgato-stream-deck,bitfocus/companion`
1. `GITHUB_TOKEN` Personal access token token for github

It can be run in docker like:

```bash
docker run --restart=always \
  -e MYSQL_URL="mysql://USERNAME:PASSWORD@HOST/DATABASE" \
  -e PROJECTS=julusian/node-elgato-stream-deck,bitfocus/companion \
  -e GITHUB_TOKEN=______ \
   julusian/grafana-github-actions

```

Or in node:

1. `yarn install`
1. `yarn build`
1. `node dist/index.js`

## Development

1. `yarn install`
1. `yarn dev`
