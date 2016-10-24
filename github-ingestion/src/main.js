const GithubApi = require('github');
const Promise = require('bluebird');
const sqlite3 = require('sqlite3');
const Kafka = require('no-kafka');

const authToken = process.env.API_TOKEN;
if (!authToken) {
  console.error('Missing API_TOKEN');
  process.exit(1);
}

const GITHUB_TOPIC = 'githubRepositories';
const github = new GithubApi({ Promise });
const db = new sqlite3.Database('/data/github-ingestion.db');
const kafkaConsumer = new Kafka.SimpleConsumer({ connectionString: 'kafka:9092' });

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

function getDbAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, res) => {
      if (err) {
        reject(err);
      } else {
        resolve(res);
      }
    });
  });
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

function setupDatabase() {
  return Promise.all([
    runDbAsync('CREATE TABLE IF NOT EXISTS repos (owner TEXT, name TEXT, last_event_id TEXT, CONSTRAINT pk PRIMARY KEY (owner, name))'),
    runDbAsync('CREATE TABLE IF NOT EXISTS consumer_offsets (topic TEXT, offset INTEGER, CONSTRAINT pk PRIMARY KEY (topic))'),
  ]);
}

async function getGithubTopicOffset() {
  const row = await getDbAsync('SELECT offset FROM consumer_offsets WHERE topic = ?', [GITHUB_TOPIC]);
  if (row) {
    return row.offset;
  }
  await runDbAsync('INSERT INTO consumer_offsets (topic, offset) VALUES (?, ?)', [GITHUB_TOPIC, 0]);
  return 0;
}

async function handleRepositoryEvent(event) {
  switch (event.$type) {
    case 'repositoryAdded': {
      const { owner, repo } = event;
      try {
        await runDbAsync('INSERT INTO repos (owner, name, last_event_id) VALUES (?, ?, ?)', [owner, repo, '-1']);
        console.log(`Now watching repo ${owner}/${repo}`);
      } catch (e) {
        if (e.code === 'SQLITE_CONSTRAINT') {
          console.error(`Repository ${owner}/${repo} already known`);
        } else {
          throw e;
        }
      }

      break;
    }
    case 'repositoryRemoved': {
      const { owner, repo } = event;
      await runDbAsync('DELETE FROM repos WHERE owner = ? AND name = ?', [owner, repo]);
      console.log(`Unsubscribed from repo ${owner}/${repo}`);
      break;
    }
    default:
      console.warn(`Unknown event type: ${event.type}`);
  }
}

async function beginListeningToRepositoryEvents() {
  async function eventHandler(messageSet) {
    for (let i = 0; i < messageSet.length; i += 1) {
      const messageData = JSON.parse(messageSet[i].message.value);
      await handleRepositoryEvent(messageData);
      const offset = messageSet[i].offset;
      await runDbAsync('UPDATE consumer_offsets SET offset = ? WHERE topic = ?', [offset + 1, GITHUB_TOPIC]);
    }
  }

  const initialOffset = await getGithubTopicOffset();
  await kafkaConsumer.init();
  kafkaConsumer.subscribe(GITHUB_TOPIC, 0, { offset: initialOffset }, eventHandler);
}

function main() {
  db.serialize();
  setupDatabase().then(() => {
    beginListeningToRepositoryEvents();
    beginWatchingKnownRepos();
  });
}

main();
