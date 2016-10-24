const GithubApi = require('github');
const Promise = require('bluebird');
const sqlite3 = require('sqlite3');

const authToken = process.env.API_TOKEN;
if (!authToken) {
  console.error('Missing API_TOKEN');
  process.exit(1);
}

const github = new GithubApi({ Promise });
const dbFile = '/data/github-ingestion.db';
const db = new sqlite3.Database(dbFile);
const watchedRepos = {};

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

function runDbAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function cb(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
}

async function watchRepo(owner, repo) {
  for (;;) {
    const lastEventId = watchedRepos[`${owner}/${repo}`];
    if (!lastEventId) {
      break;
    }

    console.log(`still watching ${owner}/${repo}`);
    const newEvents = await getEvents(owner, repo, lastEventId);
    console.log(newEvents.length);
    if (newEvents.length > 0) {
      await publishEvents(owner, repo, newEvents);
      const latestEvent = newEvents[newEvents.length - 1];
      const result = await runDbAsync('UPDATE repos SET last_event_id = ? WHERE owner = ? AND name = ?', [latestEvent.id, owner, repo]);

      const success = result.changes === 1;
      if (success) {
        watchedRepos[`${owner}/${repo}`] = latestEvent.id;
      } else {
        // since starting, this repo has become unwatched
        // TODO Make sure to detect this even when there are no new events
        break;
      }
    }

    console.log('sleeping for 5 seconds');
    await Promise.delay(5000);
  }
  console.log(`done watching ${owner}/${repo}`);
}

function beginWatchingKnownRepos() {
  console.log(watchedRepos);
  Object.keys(watchedRepos).forEach((repoString) => {
    const [owner, repo] = repoString.split('/');
    watchRepo(owner, repo);
  });
}

function setupDatabase() {
  return Promise.all([
    runDbAsync('CREATE TABLE IF NOT EXISTS repos (owner TEXT, name TEXT, last_event_id TEXT, CONSTRAINT pk PRIMARY KEY (owner, name))'),
    runDbAsync('CREATE TABLE IF NOT EXISTS consumer_offsets (topic TEXT, offset INTEGER, CONSTRAINT pk PRIMARY KEY (topic))'),
  ]);
}

function main() {
  db.serialize();
  setupDatabase().then(() => {
    db.each('SELECT owner, name, last_event_id FROM repos', (err, row) => {
      watchedRepos[`${row.owner}/${row.name}`] = row.last_event_id;
    }, () => {
      beginWatchingKnownRepos();
    });
  });
}

main();
