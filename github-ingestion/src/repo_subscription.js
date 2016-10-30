const Promise = require('bluebird');
const Kafka = require('no-kafka');
const { db, getDbAsync, runDbAsync } = require('./db_util');
const { KAFKA_CONNECTION_STRING } = require('./config');
const { fetchRepoEvents, hasNextPage, getNextPage } = require('./github_events');

const producer = new Kafka.Producer({
  connectionString: KAFKA_CONNECTION_STRING,
  codec: Kafka.COMPRESSION_SNAPPY,
});

function publishEvent(topic, eventData) {
  const metadata = { $createdAt: new Date().toISOString() };
  const augmentedEvent = Object.assign({}, eventData, metadata);
  const message = {
    topic,
    partition: 0,
    message: { value: JSON.stringify(augmentedEvent, null, 4) },
  };

  return producer.init().then(() => producer.send([message]));
}

async function publishEvents(owner, repo, events) {
  for (let i = 0; i < events.length; i += 1) {
    await publishEvent('githubEvents', { payload: events[i] });
  }
  console.log(`${events.length} events from ${owner}/${repo} successfully published`);
}

function getEventFetcher(owner, repo) {
  let firstPageETag;

  return async function(newerThanEventId) {
    const events = [];

    let resp = await fetchRepoEvents(owner, repo, 1, 100, firstPageETag);
    if (resp.status === 304) {
      return events;
    }

    firstPageETag = resp.headers.get('Etag').replace('W/', '');

    for (;;) {
      const newEvents = await resp.json();
      for (let i = 0; i < newEvents.length; i += 1) {
        const event = newEvents[i];
        if (event.id === newerThanEventId) {
          return events.reverse();
        }
        events.push(event);
      }

      if (hasNextPage(resp)) {
        resp = await getNextPage(resp);
      } else {
        return events.reverse();
      }
    }
  }
}

function getKnownRepos() {
  const stmt = db.prepare('SELECT owner, name FROM repos');
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

async function getLastEventId(owner, repo) {
  const row = await getDbAsync('SELECT last_event_id FROM repos WHERE owner = ? AND name = ?', [owner, repo]);
  return row ? row.last_event_id : undefined;
}

async function watchRepo(owner, repo) {
  const getEvents = getEventFetcher(owner, repo);
  for (;;) {
    const lastEventId = await getLastEventId(owner, repo);
    if (!lastEventId) {
      break;
    }

    const newEvents = await getEvents(lastEventId);
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

    console.log('sleeping for 15 seconds');
    await Promise.delay(15 * 1000);
  }
}

function beginWatchingKnownRepos() {
  getKnownRepos().then((repos) => {
    repos.forEach((repo) => {
      watchRepo(repo.owner, repo.name);
    });
  });
}

module.exports = {
  beginWatchingKnownRepos,
  watchRepo,
};
