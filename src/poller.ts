import { Sequelize } from 'sequelize'
import PQueue from 'p-queue'
import axios from 'axios'
import { CircleBuild, BuildState, ICircleBuild } from './models'

const circleToken = process.env.CIRCLECI_TOKEN || ''

if (!circleToken) {
	throw new Error('CIRCLECI_TOKEN is required')
}

const circleBaseUrl = 'https://circleci.com/api/v2/'

// Setup auth token
axios.defaults.headers = {
	'Circle-Token': circleToken,
	Accept: 'application/json',
}

export function assertUnreachableSafe(_: never): void {
	// Nothing to do
}

export function convertPipelineStatus(status: string): BuildState {
	switch (status) {
		case 'cancelled':
			return BuildState.Cancelled
		case 'failed':
		case 'error':
		case 'unauthorized':
			return BuildState.Failed
		case 'success':
			return BuildState.Complete
		case 'on_hold':
			return BuildState.Pending
		case 'running':
		case 'failing':
			return BuildState.Running
		case 'not_run':
			return BuildState.Skipped
		default:
			return BuildState.Failed
	}
}

async function pollWorkflow(
	projectName: string,
	workflowId: string,
	pipeline: any,
	existingDoc: CircleBuild | undefined
): Promise<void> {
	if (existingDoc?.finished && existingDoc.state !== BuildState.Running) {
		// Nothing to do
		return
	}

	const workflowReq = await axios.get(`${circleBaseUrl}workflow/${workflowId}`)
	const workflow = workflowReq.data
	// console.log(workflow)


	const buildSnippet: Pick<ICircleBuild, 'state' | 'stateMessage' | 'started' | 'finished'> = {
		state: convertPipelineStatus(workflow.status),
		stateMessage: null,
		started: workflow.created_at ? new Date(workflow.created_at) : null, // TODO - can this be a started_at?
		finished: workflow.stopped_at ? new Date(workflow.stopped_at) : null,
	}
	if (buildSnippet.state === BuildState.Failed) {
		buildSnippet.state = BuildState.Failed
		buildSnippet.stateMessage = null

		// Compile the list of failed steps
		const jobsReq = await axios.get(`${circleBaseUrl}workflow/${workflowId}/job`)
		const jobs: any[] = jobsReq.data?.items || []
		const failedSteps = jobs.filter((job): boolean => job.status === 'failed').map((job): string => job.name)
		if (failedSteps.length) {
			buildSnippet.stateMessage = failedSteps.join(' \n')
		}
		if (failedSteps.filter((job): boolean => job.indexOf('validate-') !== 0).length === 0) {
			// If only validate deps steps failed, then we can call that success
			buildSnippet.state = BuildState.Complete
		}
	} else if (buildSnippet.state === BuildState.Skipped) {
		buildSnippet.finished = buildSnippet.started
	}

	if (existingDoc) {
		await existingDoc.update(buildSnippet)
	} else {
		const build: ICircleBuild = {
			...buildSnippet,
			project: projectName,
			workflowId: workflowId,
			commitRef: pipeline.vcs?.branch,
			commitSha: pipeline.vcs?.revision,
			created: new Date(workflow.created_at),
		}

		await CircleBuild.create(build)
	}
}

async function pollPipeline(
	workQueue: PQueue,
	projectName: string,
	pipelineId: string,
	pipeline: any,
	existingDocs: CircleBuild[]
): Promise<void> {
	const workflows: any[] = []
	let workflowsReq = await axios.get(`${circleBaseUrl}pipeline/${pipelineId}/workflow`)
	workflows.push(...workflowsReq.data.items)
	let i = 0
	while (workflowsReq.data.next_page_token) {
		if (i++ > 5) break // break condition

		workflowsReq = await axios.get(
			`${circleBaseUrl}pipeline/${pipelineId}/workflow?page-token=${workflowsReq.data.next_page_token}`
		)
		workflows.push(...workflowsReq.data.items)
	}

	workQueue.addAll(
		workflows.map((workflow) => (): Promise<void> =>
			pollWorkflow(
				projectName,
				workflow.id,
				pipeline,
				existingDocs.find((doc): boolean => doc.workflowId === workflow.id)
			).catch((e) => {
				console.error(`Failed to scrape workflow: "${projectName}":"${workflow.id}"`)
				console.error(e)
			})
		)
	)
}

async function pollProject(workQueue: PQueue, projectName: string): Promise<void> {
	const pExistingDocs: Promise<CircleBuild[]> = CircleBuild.findAll({
		where: {
			project: projectName,
		},
		order: [['id', 'DESC']],
		limit: 50,
	})

	// TODO - is there a limit parameter?
	const pipelinesReq = await axios.get(`${circleBaseUrl}project/${projectName}/pipeline`)
	const pipelines = ((pipelinesReq.data?.items as any[] | undefined) || [])
		.filter((pipeline: any): boolean => pipeline.vcs?.branch !== 'gh-pages')
		.slice(0, 20)

	// console.log(pipelines)
	const existingDocs = await pExistingDocs
	// Queue all pipelines for processing
	workQueue.addAll(
		pipelines.map((pipeline) => (): Promise<void> =>
			pollPipeline(workQueue, projectName, pipeline.id, pipeline, existingDocs).catch((e) => {
				console.error(`Failed to scrape pipeline: "${projectName}":"${pipeline.id}"`)
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
