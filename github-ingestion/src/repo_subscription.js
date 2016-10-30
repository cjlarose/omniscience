const Promise = require('bluebird');
const Kafka = require('no-kafka');
const { db, runDbAsync } = require('./db_util');
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

async function getEvents(owner, repo, newerThanEventId = undefined) {
  const events = [];

  let resp = await fetchRepoEvents(owner, repo, 1, 100);
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
