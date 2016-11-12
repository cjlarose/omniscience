const Promise = require('bluebird');
const Kafka = require('no-kafka');

const { db, getDbAsync, runDbAsync } = require('./db_util');
const { KAFKA_CONNECTION_STRING } = require('./config');
const { fetchRepoEvents, hasNextPage, getNextPage } = require('./github_events');

const OUTPUT_TOPIC = 'githubEvents';

function messagePartitioner(topic, partitions, message) {
  const numPartitions = partitions.length;
  return message.key % numPartitions;
}

const producer = new Kafka.Producer({
  connectionString: KAFKA_CONNECTION_STRING,
  requiredAcks: -1,
  batch: { size: 0, maxWait: 0 },
  codec: Kafka.COMPRESSION_SNAPPY,
  partitioner: messagePartitioner,
});

function publishEvent(owner, repo, eventData) {
  const message = {
    topic: OUTPUT_TOPIC,
    message: {
      key: eventData.repo.id,
      value: JSON.stringify(eventData),
    },
  };

  return producer.init().then(() => producer.send([message]));
}

async function publishEvents(owner, repo, events) {
  for (let i = 0; i < events.length; i += 1) {
    await publishEvent(owner, repo, events[i]);
  }
  console.log(`${events.length} events from ${owner}/${repo} successfully published`);
}

async function tryUntilSuccess(f) {
  let waitTimeMs = 1000;

  for (;;) {
    try {
      return await f();
    } catch (e) {
      console.error(e.message);
      console.error(`Trying again in ${waitTimeMs} ms`);
      await Promise.delay(waitTimeMs);
      waitTimeMs *= 2;
    }
  }
}

function getEventFetcher(owner, repo) {
  let firstPageETag;

  return async function(newerThanEventId) {
    const events = [];

    let resp = await tryUntilSuccess(() => fetchRepoEvents(owner, repo, 1, 100, firstPageETag));
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
        resp = await tryUntilSuccess(() => getNextPage(resp));
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
