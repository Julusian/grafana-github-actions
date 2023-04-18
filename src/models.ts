import { Sequelize, Model, DataTypes, DataType, ModelAttributeColumnOptions } from 'sequelize'
import { readFileSync } from 'node:fs'

const mysqlHost = process.env.MYSQL_HOST || ''
if (!mysqlHost || mysqlHost.length === 0) {
	throw new Error('MYSQL_HOST is required')
}

const mysqlDatabase = process.env.MYSQL_DATABASE || ''
if (!mysqlDatabase || mysqlDatabase.length === 0) {
	throw new Error('MYSQL_DATABASE is required')
}

const mysqlUser = process.env.MYSQL_USER || ''
if (!mysqlUser || mysqlUser.length === 0) {
	throw new Error('MYSQL_USER is required')
}

const mysqlPassword = process.env.MYSQL_PASSWORD || ''
if (!mysqlPassword || mysqlUser.length === 0) {
	throw new Error('MYSQL_PASSWORD is required')
}

const mysqlCertPath = process.env.MYSQL_CA_PATH || ''
if (!mysqlCertPath || mysqlCertPath.length === 0) {
	throw new Error('MYSQL_CA_PATH is required')
}

const mysqlCert = [readFileSync(mysqlCertPath, 'utf8')] || ''
if (!mysqlCert || mysqlCert.length === 0) {
	throw new Error('Cert can not be empty')
}

const sequelize = new Sequelize(mysqlDatabase, mysqlUser, mysqlPassword, {
	host: mysqlHost,
	dialect: 'mysql',
	dialectOptions: {
		ssl: {
			ca: mysqlCert,
			rejectUnauthorized: false,
		},
	},
})

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

export class GithubActionsBuild extends Model<IGithubActionsBuild> implements IGithubActionsBuild {
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
		runId: DataTypes.BIGINT,
		commitSha: DataTypes.STRING,
		commitRef: DataTypes.STRING,
		state: {
			type: DataTypes.ENUM,
			values: Object.values<BuildState>(BuildState),
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
