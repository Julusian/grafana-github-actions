import { createTerminus, HealthCheckError, TerminusOptions } from '@godaddy/terminus';
import { createServer } from 'http'
import * as PouchDB from 'pouchdb'
// import PAll from 'p-all'
import * as express from 'express'
import * as reissue from 'reissue'
import * as Prometheus from 'prom-client';
import * as Metrics from './metrics';

let initialScrapingFinished = false
async function healthCheck(): Promise<any> {
    if (!initialScrapingFinished) {
        throw new HealthCheckError('healthcheck failed', ['Initial scraping not finished']);
    }
    return {};
}

async function onSignal(): Promise<any> {
    console.log('caught signal. Starting cleanup');
}

async function onShutdown(): Promise<any> {
    console.log('cleanup finished, server is shutting down');
}

const terminusOptions: TerminusOptions = {
    healthChecks: {
        '/healthcheck': healthCheck,
    },
    signals: [ 'SIGINT', 'SIGTERM' ],
    onSignal,
    onShutdown,
    logger: console.log,
};

const app = express()
const port = 9600  
const server = createServer(app);

createTerminus(server, terminusOptions);

const registry = new PouchDB('http://registry.npmjs.com');

interface PackageInfo {
    id: string
    versions: Array<{
        name: string
        date: string
        tag?: string
    }>
}

let currentData: PackageInfo[] = []

async function doPoll() {
    console.log('Starting poll')
    // TODO - handle failure of a single package
    const packages = await Promise.all([
        registry.get<any>('atem-connection'),
        registry.get<any>('atem-state'),
        registry.get<any>('timeline-state-resolver'),
    ])

    currentData = packages.map((res) => {
        const distTags = res['dist-tags']
        return {
            id: res._id,
            versions: Object.keys(res.time).map(v => {
                const tag = Object.keys(distTags).find(t => distTags[t] === v)
                
                return {
                    name: v,
                    date: res.time[v],
                    tag: tag
                }
            })
        }
    })

    initialScrapingFinished = true
    console.log('Completed poll')
}

const poller = reissue.create({
    func: async (callback: () => void) => {
        try {
            await doPoll() 
        } catch (e) {
            console.error(`Poll threw error: ${e}`)
        }
        return callback();
    },
    interval: 30000
});

poller.start();

app.get('/metrics', (_req, res) => {
    console.log('Got scrape')

    Metrics.packageVersions.reset()

    currentData.forEach(pkg => {
        pkg.versions.forEach(ver => {
            if (ver.name === 'created' || ver.name === 'modified') return
            Metrics.packageVersions.set({ package: pkg.id, version: ver.name, release: ver.date}, 1)
        })
    })

    res.set('Content-Type', Prometheus.register.contentType);
    res.end(Prometheus.register.metrics());
})

server.listen(port, () => console.log(`Listening at http://localhost:${port}`))