import { Gauge, Histogram } from 'prom-client';

// // An interface would not be compatible with labelValues
// // tslint:disable-next-line
// export type Labels = {
//     owner: string;
//     repo: string;
//     success: string;
//     branch: string;
//     workflow_job: string;
//     workflow: string;
//     upstream_jobs: string;
// };

// // An interface would not be compatible with labelValues
// // tslint:disable-next-line
// export type ArtifactLabels = {
//     owner: string;
//     repo: string;
//     branch: string;
//     artifact_name: string;
// };

// // An interface would not be compatible with labelValues
// // tslint:disable-next-line
// export type TestMetadataLabels = {
//     owner: string;
//     repo: string;
//     branch: string;
// };

// const buildTimes: Histogram = new Histogram({
//     name: 'circleci_build_time',
//     help: 'Build time in seconds',
//     labelNames: ['owner', 'repo', 'success', 'branch', 'workflow', 'workflow_job', 'upstream_jobs'],
//     buckets: [0, 60, 120, 180, 240, 300, 420, 540, 660, 780, 900, 1200],
// });

const packageVersions: Gauge<'package' | 'version' | 'release'> = new Gauge({
    name: 'npm_package_version',
    help: 'NPM package version',
    labelNames: ['package', 'version', 'release'],
});

// const codeCoverageMethods: Gauge = new Gauge({
//     name: 'circleci_code_coverage_methods',
//     help: 'Method based code coverage in %',
//     labelNames: ['owner', 'repo', 'branch', 'artifact_name'],
// });

// const codeCoverageClasses: Gauge = new Gauge({
//     name: 'circleci_code_coverage_classes',
//     help: 'Class based code coverage in %',
//     labelNames: ['owner', 'repo', 'branch', 'artifact_name'],
// });

// const testMetadataSuccess: Gauge = new Gauge({
//     name: 'circleci_test_metadata_success',
//     help: 'Number of successfull tests',
//     labelNames: ['owner', 'repo', 'branch'],
// });

// const testMetadataFailure: Gauge = new Gauge({
//     name: 'circleci_test_metadata_failure',
//     help: 'Number of failed tests',
//     labelNames: ['owner', 'repo', 'branch'],
// });

// const testMetadataRunTime: Gauge = new Gauge({
//     name: 'circleci_test_metadata_run_time',
//     help: 'Total run time for tests execution',
//     labelNames: ['owner', 'repo', 'branch'],
// });

export {
    // buildTimes,
    packageVersions,
    // codeCoverageMethods,
    // codeCoverageClasses,
    // testMetadataSuccess,
    // testMetadataFailure,
    // testMetadataRunTime,
};
