import { createTerminus, HealthCheckError, TerminusOptions } from '@godaddy/terminus'
import { createServer } from 'http'
import * as express from 'express'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import * as reissue from 'reissue'

import { initDb } from './models'
import { doPoll } from './poller'

let initialScrapingFinished = false
async function healthCheck(): Promise<any> {
	if (!initialScrapingFinished) {
		throw new HealthCheckError('healthcheck failed', ['Initial scraping not finished'])
	}
	return {}
}

async function onSignal(): Promise<any> {
	console.log('caught signal. Starting cleanup')
}

async function onShutdown(): Promise<any> {
	console.log('cleanup finished, server is shutting down')
}

const terminusOptions: TerminusOptions = {
	healthChecks: {
		'/healthcheck': healthCheck,
	},
	signals: ['SIGINT', 'SIGTERM'],
	onSignal,
	onShutdown,
	logger: console.log,
}

const port = Number(process.env.PORT) || 9600
const pollInterval = Number(process.env.POLL_INTERVAL) || 30000
const projectsList = (process.env.PROJECTS || '').split(',').filter((n): boolean => !!n)

if (projectsList.length === 0) {
	throw new Error('Some packages must be specified')
}

const app = express()
const server = createServer(app)

createTerminus(server, terminusOptions)

initDb()
	.then((sequelize): void => {
		const poller = reissue.create({
			func: async (callback: () => void) => {
				try {
					// await workQueue.add(() => doPoll())
					await doPoll(sequelize, projectsList)
					initialScrapingFinished = true
				} catch (e) {
					console.error(`Poll threw error: ${JSON.stringify(e)}`)
				}
				return callback()
			},
			interval: pollInterval,
		})

		poller.start()
	})
	.catch((e) => {
		console.error(`Failed to connect to the db: ${e}`)
		// eslint-disable-next-line no-process-exit
		process.exit(1)
	})

server.listen(port, () => console.log(`Listening at http://localhost:${port}`))
