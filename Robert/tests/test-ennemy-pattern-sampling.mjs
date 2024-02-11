import { strict as assert } from 'node:assert';

function samplePatternIndex(difficulty) {
	const distributions = [
		{
			fromDifficulty: 0,
			likelihoods: [ 1, 1 ],
		},
		{
			fromDifficulty: 1,
			likelihoods: [ 1, 1, 2 ],
		},
		{
			fromDifficulty: 2,
			likelihoods: [ 1, 1, 10 ],
		},
		{
			fromDifficulty: 4,
			likelihoods: [ 0, 0, 1 ],
		},
	];
	let likelihoods = [];
	for (const dist of distributions) {
		if (dist.fromDifficulty > difficulty) {
			break;
		}
		likelihoods = dist.likelihoods;
	}
	const total = likelihoods.reduce((s, x) => s + x, 0);
	let sample = Math.floor(Math.random() * total);
	let patternIdx = 0;
	for (const l of likelihoods) {
		sample -= l;
		if (sample < 0) {
			break;
		}
		patternIdx += 1;
	}
	return Math.min(patternIdx, likelihoods.length - 1);
}


function assertIsClose(a, b, epsilon) {
	epsilon = epsilon ?? 1e-6;
	assert(a.length == b.length);
	for (let i = 0 ; i < a.length ; ++i) {
		const err = Math.abs(b[i] - a[i]);
		assert(err < epsilon);
	}
}

function runSampleTest(difficulty, count) {
	const sampledDistribution = [ 0, 0, 0 ];
	const incr = 1.0 / count;
	for (let i = 0 ; i < count ; ++i) {

		const idx = samplePatternIndex(difficulty);
		assert(idx >= 0);
		assert(idx < sampledDistribution.length);
		sampledDistribution[idx] += incr;
	}
	return sampledDistribution;
}

function test() {
	let sampledDistribution;
	sampledDistribution = runSampleTest(0, 1000000);
	console.log("difficulty", 0, "dist", sampledDistribution);
	assertIsClose(sampledDistribution, [ 0.5, 0.5, 0.0 ], 0.01);

	sampledDistribution = runSampleTest(1, 1000000);
	console.log("difficulty", 1, "dist", sampledDistribution);
	assertIsClose(sampledDistribution, [ 0.25, 0.25, 0.5 ], 0.01);

	sampledDistribution = runSampleTest(2, 1000000);
	console.log("difficulty", 2, "dist", sampledDistribution);
	assertIsClose(sampledDistribution, [ 1/12, 1/12, 10/12 ], 0.01);

	sampledDistribution = runSampleTest(3, 1000000);
	console.log("difficulty", 3, "dist", sampledDistribution);
	assertIsClose(sampledDistribution, [ 1/12, 1/12, 10/12 ], 0.01);

	sampledDistribution = runSampleTest(4, 1000000);
	console.log("difficulty", 4, "dist", sampledDistribution);
	assertIsClose(sampledDistribution, [ 0.0, 0.0, 1.0 ], 0.01);
}

test();
