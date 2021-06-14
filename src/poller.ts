import { Sequelize } from 'sequelize'
import PQueue from 'p-queue'
import { BuildState, GithubActionsBuild, IGithubActionsBuild } from './models'
import { Octokit, RestEndpointMethodTypes } from '@octokit/rest'
import _ = require('underscore')

const githubToken = process.env.GITHUB_TOKEN || ''

if (!githubToken) {
	throw new Error('GITHUB_TOKEN is required')
}

const octokit = new Octokit({
	auth: githubToken,
})

export function assertUnreachableSafe(_: never): void {
	// Nothing to do
}

function convertJobStatus(status: string, conclusion: string | null): BuildState {
	switch (status) {
		case 'completed':
			switch (conclusion) {
				case 'success':
					return BuildState.Complete
				case 'skipped':
				case 'neutral':
					return BuildState.Skipped
				case 'action_required':
				case 'cancelled':
				case 'timed_out':
				case 'failure':
				default:
					return BuildState.Failed
			}
		case 'queued':
			return BuildState.Pending
		case 'in_progress':
			return BuildState.Running
		default:
			return BuildState.Failed
	}
}
function convertWorkflowStatus(
	jobs: Array<{ state: BuildState }>,
	status: string,
	conclusion: string | null
): BuildState {
	const baseStatus = convertJobStatus(status, conclusion)
	if (jobs.length === 0) return baseStatus

	// if all pending, then pending
	if (!jobs.find((j) => j.state !== BuildState.Pending)) {
		return BuildState.Pending
	}

	// If any pending/running, then running
	if (jobs.find((j) => j.state === BuildState.Pending || j.state === BuildState.Running)) {
		return BuildState.Running
	}

	// If any failed, then fail
	if (jobs.find((j) => j.state === BuildState.Failed)) {
		return BuildState.Failed
	}

	// if all complete/skipped, then complete
	if (!jobs.find((j) => j.state !== BuildState.Complete && j.state !== BuildState.Skipped)) {
		return BuildState.Complete
	}

	// fallback that should never be hit
	return baseStatus
}

function isFinished(state: BuildState): boolean {
	switch (state) {
		case BuildState.Pending:
		case BuildState.Running:
			return false
		// case BuildState.Cancelled:
		case BuildState.Complete:
		case BuildState.Failed:
		case BuildState.Skipped:
			return true
		default:
			assertUnreachableSafe(state)
			return true
	}
}

type ElementType<T extends ReadonlyArray<unknown>> = T extends ReadonlyArray<infer ElementType> ? ElementType : never

type WorkFlowRun = ElementType<
	RestEndpointMethodTypes['actions']['listWorkflowRunsForRepo']['response']['data']['workflow_runs']
>

async function pollWorkflowRun(
	_workQueue: PQueue,
	owner: string,
	repo: string,
	workflowNames: Map<number, string>,
	run: WorkFlowRun,
	existingDoc: GithubActionsBuild | undefined
): Promise<void> {
	if (existingDoc?.finished && existingDoc.state !== BuildState.Running) {
		// Nothing to do
		return
	}

	const jobs = await octokit.actions.listJobsForWorkflowRun({
		owner,
		repo,
		run_id: run.id,
	})

	const jobsSimple = jobs.data.jobs.map((j) => ({
		name: j.name,
		started: j.started_at ? new Date(j.started_at) : null,
		finished: j.completed_at ? new Date(j.completed_at) : null,
		state: convertJobStatus(j.status, j.conclusion),
	}))

	const buildSnippet: Pick<IGithubActionsBuild, 'state' | 'stateMessage' | 'started' | 'finished'> = {
		state: convertWorkflowStatus(jobsSimple, run.status, run.conclusion),
		stateMessage: null,
		started: null,
		finished: null,
	}

	const startedTimes = _.compact(jobsSimple.map((j) => j.started))
	const finishedTimes = _.compact(jobsSimple.map((j) => j.finished))
	buildSnippet.started = startedTimes.length > 0 ? (_.min(startedTimes, (j) => j.getTime()) as Date) : null
	buildSnippet.finished =
		finishedTimes.length > 0 && isFinished(buildSnippet.state)
			? (_.max(finishedTimes, (j) => j.getTime()) as Date)
			: null

	if (buildSnippet.state === BuildState.Failed) {
		buildSnippet.state = BuildState.Failed
		buildSnippet.stateMessage = null

		// Compile the list of failed steps
		const failedJobs = jobsSimple.filter((j) => j.state === BuildState.Failed).map((j) => j.name)
		if (failedJobs.length) {
			buildSnippet.stateMessage = failedJobs.join(' \n')
		}
		if (
			failedJobs.filter(
				(job): boolean => job.indexOf('validate-all-') !== 0 && job.indexOf('Validate all ') !== 0
			).length === 0
		) {
			// If only validate deps steps failed, then we can call that success
			buildSnippet.state = BuildState.Complete
		}
	} else if (buildSnippet.state === BuildState.Skipped) {
		buildSnippet.finished = buildSnippet.started
	} else if (buildSnippet.state === BuildState.Running) {
		const runningJobs = jobsSimple.filter((j) => j.state === BuildState.Running).map((j) => j.name)
		if (runningJobs.length) {
			buildSnippet.stateMessage = runningJobs.join(' \n')
		}
	}

	if (existingDoc) {
		await existingDoc.update(buildSnippet)
	} else {
		const build: IGithubActionsBuild = {
			...buildSnippet,
			owner,
			repo,
			workflowName: workflowNames.get(run.workflow_id) ?? '',
			runId: run.id,
			commitRef: run.head_branch,
			commitSha: run.head_sha,
			created: new Date(run.created_at),
		}

		await GithubActionsBuild.create(build)
	}
}

async function pollProject(workQueue: PQueue, projectName: string): Promise<void> {
	const projectParts = projectName.split('/')
	if (projectParts.length !== 2) {
		throw new Error(`Bad project name: "${projectName}"`)
	}
	const [owner, repo] = projectParts

	const pExistingDocs: Promise<GithubActionsBuild[]> = GithubActionsBuild.findAll({
		where: {
			owner,
			repo,
		},
		order: [['id', 'DESC']],
		limit: 50,
	})

	const [workflows, workflowRuns, existingDocs] = await Promise.all([
		octokit.actions.listRepoWorkflows({
			owner,
			repo,
		}),
		octokit.actions.listWorkflowRunsForRepo({
			owner,
			repo,
			per_page: 10,
		}),
		pExistingDocs,
	])

	const workflowNames = new Map<number, string>()
	for (const flow of workflows.data.workflows) {
		workflowNames.set(flow.id, flow.name)
	}

	// Queue all runs for processing
	workQueue.addAll(
		workflowRuns.data.workflow_runs.map((run) => (): Promise<void> =>
			pollWorkflowRun(
				workQueue,
				owner,
				repo,
				workflowNames,
				run,
				existingDocs.find((doc): boolean => doc.runId === run.id)
			).catch((e) => {
				console.error(`Failed to scrape run: "${projectName}":"${run.id}"`)
				console.error(e)
			})
		)
	)
}

export async function doPoll(_sequelize: Sequelize, projectList: string[]): Promise<void> {
	console.log('Starting poll')

	const workQueue = new PQueue({
		concurrency: 20,
		// TODO - timeout error handling
		timeout: 4000,
	})

	workQueue.addAll(
		projectList.map((projectName): (() => Promise<void>) => (): Promise<void> => {
			return pollProject(workQueue, projectName).catch((e) => {
				console.error(`Failed to scrape project: "${projectName}"`)
				console.error(e)
			})
		})
	)

	await workQueue.onIdle()
	console.log('Completed poll')
}
