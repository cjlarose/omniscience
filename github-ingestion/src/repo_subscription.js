const GithubApi = require('github');
const Promise = require('bluebird');
const { db, runDbAsync } = require('./db_util');

const authToken = process.env.API_TOKEN;
if (!authToken) {
  console.error('Missing API_TOKEN');
  process.exit(1);
}

const github = new GithubApi({ Promise });

github.authenticate({ type: 'oauth', token: authToken });

async function getEvents(owner, repo, newerThanEventId = undefined) {
  const reqOptions = { owner, repo, page: 1, per_page: 100 };
  const events = [];

  let resp = await github.activity.getEventsForRepo(reqOptions);
  for (;;) {
    for (let i = 0; i < resp.length; i += 1) {
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

function getKnownRepos() {
  const stmt = db.prepare('SELECT owner, name, last_event_id FROM repos');
  return new Promise((resolve, reject) => {
    stmt.all([], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

async function beginWatchingKnownRepos() {
  for (;;) {
    const repos = await getKnownRepos();
    for (let i = 0; i < repos.length; i += 1) {
      const { owner, name: repo, last_event_id: lastEventId } = repos[i];
      console.log(owner, repo, lastEventId);
      const newEvents = await getEvents(owner, repo, lastEventId);

      if (newEvents.length > 0) {
        await publishEvents(owner, repo, newEvents);
        const latestEvent = newEvents[newEvents.length - 1];
        const result = await runDbAsync('UPDATE repos SET last_event_id = ? WHERE owner = ? AND name = ?', [latestEvent.id, owner, repo]);

        const success = result.changes === 1;
        if (success) {
          console.log(`Successfully updated last_event_id for repo ${owner}/${repo}`);
        } else {
          // repo became unwatched
          console.log(`${owner}/${repo} is no longer being watched`);
        }
      }
    }

    console.log('sleeping for 15 seconds');
    await Promise.delay(15 * 1000);
  }
}

module.exports = {
  beginWatchingKnownRepos,
};
