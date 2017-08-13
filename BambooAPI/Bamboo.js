const _ = require('lodash');

const Request = require('./Request').Request;
const BambooResponseBodyMapper = require('./BambooResponseBodyMapper').BambooResponseBodyMapper;

class Bamboo {

    constructor(user, password) {

        this.options = {
            url: '',
            headers: { 'Accept': 'Application/JSON' },
            auth: { user, password }
        };

        this.bambooUrl = 'https://www.intapp.com/bamboo/rest/api/latest';
    }

    async getJobs(plan, maxResult) {

        this.options.url = `${this.bambooUrl}/search/jobs/${plan}?max-result=${maxResult || 1000}`;
        let jobs = await this._get(BambooResponseBodyMapper.getJobs);

        return jobs;
    }

    async getChanges(plan, fromVersion, toVersion) {

        let changes = [];

        for (let version = fromVersion; version <= (toVersion || fromVersion); version++) {

            this.options.url = `${this.bambooUrl}/result/${plan}-${version}?expand=changes.change.files`
            changes.push(await this._get(BambooResponseBodyMapper.getChanges));
        }

        return this._combineChanges(changes);
    }

    async getJobAllTests(jobId, version) {

        let existingSuccessfulTests = await this.getJobExistingSuccessfulTests(jobId, version);
        let fixedTests = await this.getJobFixedTests(jobId, version);
        let existingFailedTests = await this.getJobExistingFailedTests(jobId, version);
        let newFailedTests = await this.getJobNewFailedTests(jobId, version);
        let skippedTests = await this.getJobSkippedTests(jobId, version);
        let quarantinedTests = await this.getJobQuarantinedTests(jobId, version);

        return _
            .concat(existingSuccessfulTests, fixedTests, existingFailedTests, newFailedTests, skippedTests, quarantinedTests);
    }

    async getJobExistingSuccessfulTests(jobId, version) {

        this.options.url = `${this.bambooUrl}/result/${jobId}-${version}?expand=testResults.successfulTests.testResult.errors`
        let successfulTests = await this._get(BambooResponseBodyMapper.getTests, { testsType: 'successfulTests' });

        this.options.url = `${this.bambooUrl}/result/${jobId}-${version}?expand=testResults.fixedTests.testResult.errors`
        let fixedTests = await this._get(BambooResponseBodyMapper.getTests, { testsType: 'fixedTests' });

        let existingSuccessfulTests = _
            .xorWith(successfulTests, fixedTests, _.isEqual);

        return _
            .each(existingSuccessfulTests, test => test.status = 'SUCCSESSFUL, EXISTING');
    }

    async getJobFixedTests(jobId, version) {

        this.options.url = `${this.bambooUrl}/result/${jobId}-${version}?expand=testResults.fixedTests.testResult.errors`
        let fixedTests = await this._get(BambooResponseBodyMapper.getTests, { testsType: 'fixedTests' });

        return _
            .each(fixedTests, test => test.status = 'SUCCESSFUL, FIXED');
    }

    async getJobExistingFailedTests(jobId, version) {

        this.options.url = `${this.bambooUrl}/result/${jobId}-${version}?expand=testResults.existingFailedTests.testResult.errors`
        let tests = await this._get(BambooResponseBodyMapper.getTests, { testsType: 'existingFailedTests' });

        return _
            .each(tests, test => test.status = 'FAILED, EXISTING');
    }

    async getJobNewFailedTests(jobId, version) {

        this.options.url = `${this.bambooUrl}/result/${jobId}-${version}?expand=testResults.newFailedTests.testResult.errors`
        let tests = await this._get(BambooResponseBodyMapper.getTests, { testsType: 'newFailedTests' });

        return _
            .each(tests, test => test.status = 'FAILED, NEW');
    }

    async getJobSkippedTests(jobId, version) {

        this.options.url = `${this.bambooUrl}/result/${jobId}-${version}?expand=testResults.skippedTests.testResult.errors`
        let tests = await this._get(BambooResponseBodyMapper.getTests, { testsType: 'skippedTests' });

        return _
            .each(tests, test => test.status = 'SKIPPED')
    }

    async getJobQuarantinedTests(jobId, version) {

        this.options.url = `${this.bambooUrl}/result/${jobId}-${version}?expand=testResults.quarantinedTests.testResult.errors`
        let tests = await this._get(BambooResponseBodyMapper.getTests, { testsType: 'quarantinedTests' });

        return _
            .each(tests, test => test.status = 'QUARANTINED')
    }

    _get(bodyMapperFunction, paramsObj) {

        return Request.get(this.options).then((response) => {

            return new Promise((resolve, reject) => {

                if (response.statusCode != 200) {

                    reject(new Error(response.statusMessage));
                }

                resolve(bodyMapperFunction(response.body, paramsObj));
            });
        });
    }

    _combineChanges(changes) {

        return _
            .chain(changes)
            .filter(change => change.length > 0)
            .flatten()
            .groupBy('author')
            .toPairs()
            .map(this._mapGroupedChanges)
            .value();
    }

    _mapGroupedChanges(groupedChanges) {

        return {
            author: groupedChanges[0],
            features: _
                .chain(groupedChanges[1])
                .map('features')
                .flatten()
                .uniq()
                .value()
        };
    }
}

exports.Bamboo = Bamboo;
