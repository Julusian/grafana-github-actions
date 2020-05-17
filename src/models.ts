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
	Cancelled = 'cancelled',
	Skipped = 'skipped',
}

export function BuildStateFinished(state: BuildState | undefined): boolean {
	switch (state) {
		case BuildState.Cancelled:
		case BuildState.Failed:
		case BuildState.Complete:
		case BuildState.Skipped:
			return true
		default:
			return false
	}
}

// export enum LoggedEventType {
// 	BuildStart = 'build-start',
// 	BuildSuccess = 'build-success',
// 	BuildFailure = 'build-failure',
// 	BuildCancelled = 'build-cancelled',
// }

// export interface ICircleEvent {
// 	project: string
// 	type: LoggedEventType
// 	message: string
// 	time: Date
// }
export interface ICircleBuild {
	project: string
	workflowId: string

	commitSha: string
	commitRef: string

	state: BuildState
	stateMessage: string | null

	created: Date
	started: Date | null
	finished: Date | null
}

// export class CircleEvent extends Model implements ICircleEvent {
// 	public project!: string
// 	public type!: LoggedEventType
// 	public message!: string
// 	public time!: Date
// }
export class CircleBuild extends Model implements ICircleBuild {
	public project!: string
	public workflowId!: string

	public commitSha!: string
	public commitRef!: string

	public state!: BuildState
	public stateMessage!: string | null

	public created!: Date
	public started!: Date | null
	public finished!: Date | null
}

// CircleEvent.init(
// 	literal<{ [field in keyof ICircleEvent]: DataType | ModelAttributeColumnOptions }>({
// 		project: DataTypes.STRING,
// 		type: DataTypes.STRING,
// 		message: DataTypes.STRING,
// 		time: DataTypes.DATE,
// 	}),
// 	{
// 		sequelize,
// 		modelName: 'circleci_event',
// 		createdAt: false,
// 		updatedAt: false,
// 		deletedAt: false,
// 		indexes: [
// 			{
// 				fields: ['project'],
// 			},
// 		],
// 	}
// )
CircleBuild.init(
	literal<{ [field in keyof ICircleBuild]: DataType | ModelAttributeColumnOptions }>({
		project: DataTypes.STRING,
		workflowId: DataTypes.STRING,
		commitSha: DataTypes.STRING,
		commitRef: DataTypes.STRING,
		state: {
			type: DataTypes.ENUM,
			values: Object.values(BuildState),
		},
		stateMessage: DataTypes.STRING,
		created: DataTypes.DATE,
		started: DataTypes.DATE,
		finished: DataTypes.DATE,
	}),
	{
		sequelize,
		modelName: 'circleci_build',
		createdAt: false,
		updatedAt: false,
		deletedAt: false,
		indexes: [
			{
				fields: ['project'],
			},
			{
				fields: ['workflowId'],
			},
			{
				fields: ['workflowId', 'project'],
				unique: true,
			},
		],
	}
)

export function initDb(): Promise<Sequelize> {
	return sequelize.sync().then(() => sequelize)
}
