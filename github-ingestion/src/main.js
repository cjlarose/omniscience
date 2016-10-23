const GithubApi = require('github');
const Promise = require('bluebird');
const redisApi = require('redis');

const authToken = process.env.API_TOKEN;
if (!authToken) {
  console.error('Missing API_TOKEN');
  process.exit(1);
}

Promise.promisifyAll(redisApi.RedisClient.prototype);

const redis = redisApi.createClient({ host: 'redis' });
const github = new GithubApi({ Promise });
const watchedRepos = new Set();

github.authenticate({ type: 'oauth', token: authToken });

async function getEvents(owner, repo, newerThanEventId = undefined) {
  const reqOptions = { owner, repo, page: 1, per_page: 100 };
  const events = [];

  let resp = await github.activity.getEventsForRepo(reqOptions);
  for (;;) {
    for (let i = 0; i < resp.length; i++) {
      const event = resp[i];
      if (event.id === newerThanEventId) {
        return events.reverse();
      }
      events.push(event);
    }

    if (github.hasNextPage(resp)) {
      resp = await github.getNextPage(resp, {});
    } else {
      return events.reverse();
    }
  }
}

async function publishEvents(owner, repo, events) {
  for (event of events) {
    console.log(`publishing event ${event.id} of ${owner}/${repo}`);
  }
}

async function watchRepo(owner, repo) {
  while (watchedRepos.has(`${owner}/${repo}`)) {
    console.log(`still watching ${owner}/${repo}`);
    const events = await getEvents(owner, repo);
    console.log(events.length);
    await publishEvents(owner, repo, events);
    console.log('sleeping for 5 seconds');
    await Promise.delay(5000);
  }
  console.log(`done watching ${owner}/${repo}`);
}

async function beginWatchingKnownRepos() {
  await redis.onAsync('ready');
  const reposKey = 'github-ingestion:repos';
  const repoStrings = await redis.lrangeAsync(reposKey, 0, -1);
  for (let repoString of repoStrings) {
    watchedRepos.add(repoString);
    const [owner, repo] = repoString.split('/');
    watchRepo(owner, repo);
  }
}

redis.on('error', (err) => {
  console.log('redis error');
  console.error(err);
});

beginWatchingKnownRepos().then(() => {console.log('main done');}, () => console.error(err));
