# Grafana CircleCI Builds bridge

This projects monitors builds for specified projects in circleci, storing the status into a mysql database for consumption in grafana.

## Example query

```sql
SELECT
  REPLACE(REPLACE(project, 'github/SuperFlyTV/', 'superfly/'), 'github/nrkno/tv-automation-', 'nrkno/') as Project,
  concat(commitRef, " (", substring(commitSha, 1, 8), ")") as Ref,
  CONVERT(state, SIGNED) as State,
  stateMessage as Failed,
  TIMEDIFF(IFNULL(finished, NOW()), started) as Duration,
  created
FROM circleci_builds
WHERE (created >= $__timeFrom() AND (created <= $__timeTo() OR finished <= $__timeTo() OR finished IS NULL))
  AND (project LIKE 'github/nrkno/%' OR project LIKE 'github/SuperFlyTV/%')
ORDER BY created DESC
LIMIT 50

```

## Installation

Ensure you have a running mysql server

Define the following environment variables, updating for your setup as appropriate:

1. `MYSQL_URL` eg `mysql://USERNAME:PASSWORD@HOST/DATABASE`
1. `PROJECTS` A comma separated list of projects to monitor eg `github/nrkno/tv-automation-atem-connection,github/nrkno/tv-automation-state-timeline-resolver`
1. `CIRCLECI_TOKEN` API token for circleci

It can be run in docker like:

```bash
docker run --restart=always \
  -e MYSQL_URL="mysql://USERNAME:PASSWORD@HOST/DATABASE" \
  -e PROJECTS=github/nrkno/tv-automation-atem-connection,github/nrkno/tv-automation-state-timeline-resolver \
  -e CIRCLECI_TOKEN=______ \
   julusian/grafana-circleci

```

Or in node:

1. `yarn install`
1. `yarn build`
1. `node dist/index.js`

## Development

1. `yarn install`
1. `yarn dev`
