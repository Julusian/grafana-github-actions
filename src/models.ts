import { Sequelize, Model, DataTypes, DataType, ModelAttributeColumnOptions } from 'sequelize'

const mysqlUrl = process.env.MYSQL_URL || ''

if (!mysqlUrl || mysqlUrl.length === 0) {
	throw new Error('MYSQL_URL is required')
}

const sequelize = new Sequelize(mysqlUrl)

export function literal<T>(v: T): T {
	return v
}

export enum BuildState {
	Pending = 'pending',
	Running = 'running',
	Complete = 'complete',
	Failed = 'failed',
	// Cancelled = 'cancelled',
	Skipped = 'skipped',
}

export interface IGithubActionsBuild {
	owner: string
	repo: string

	workflowName: string
	runId: number

	commitSha: string
	commitRef: string

	state: BuildState
	stateMessage: string | null

	created: Date
	started: Date | null
	finished: Date | null
}

export class GithubActionsBuild extends Model implements IGithubActionsBuild {
	public owner!: string
	public repo!: string

	public workflowName!: string
	public runId!: number

	public commitSha!: string
	public commitRef!: string

	public state!: BuildState
	public stateMessage!: string | null

	public created!: Date
	public started!: Date | null
	public finished!: Date | null
}

GithubActionsBuild.init(
	literal<{ [field in keyof IGithubActionsBuild]: DataType | ModelAttributeColumnOptions }>({
		owner: DataTypes.STRING,
		repo: DataTypes.STRING,
		workflowName: DataTypes.STRING,
		runId: DataTypes.INTEGER,
		commitSha: DataTypes.STRING,
		commitRef: DataTypes.STRING,
		state: {
			type: DataTypes.ENUM,
			values: Object.values(BuildState),
		},
		stateMessage: DataTypes.TEXT,
		created: DataTypes.DATE,
		started: DataTypes.DATE,
		finished: DataTypes.DATE,
	}),
	{
		sequelize,
		modelName: 'github_actions_build',
		createdAt: false,
		updatedAt: false,
		deletedAt: false,
		indexes: [
			{
				fields: ['owner', 'repo'],
			},
			{
				fields: ['runId'],
			},
			{
				fields: ['runId', 'owner', 'repo'],
				unique: true,
			},
		],
	}
)

export async function initDb(): Promise<Sequelize> {
	await sequelize.authenticate()
	await sequelize.sync()

	return sequelize
}
