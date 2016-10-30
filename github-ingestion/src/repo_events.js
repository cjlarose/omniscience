const { getDbAsync, runDbAsync } = require('./db_util');
const { watchRepo } = require('./repo_subscription');
const Kafka = require('no-kafka');

const kafkaConsumer = new Kafka.SimpleConsumer({ connectionString: 'kafka:9092' });
const GITHUB_TOPIC = 'githubRepositories';

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
        watchRepo(owner, repo);
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

module.exports = {
  beginListeningToRepositoryEvents,
};
