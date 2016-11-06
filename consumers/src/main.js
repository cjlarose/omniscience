const redux = require('redux');
const reducers = require('./reducers/index.js');
const Kafka = require('no-kafka');
const { setupDatabase, getDbAsync, runDbAsync } = require('./db_util');

const kafkaConsumer = new Kafka.SimpleConsumer({ connectionString: 'kafka:9092' });
const kafkaProducer = new Kafka.Producer({
  connectionString: 'kafka:9092',
  requiredAcks: -1,
  batch: { size: 0, maxWait: 0 },
  codec: Kafka.COMPRESSION_SNAPPY,
});
const TOPICS = ['githubEvents', 'pushEventAnnotations'];

async function getConsumerState(key, defaultVal) {
  const row = await getDbAsync('SELECT value FROM consumer_state WHERE [key] = ?', [key]);
  if (!row) {
    const params = [key, JSON.stringify(defaultVal)];
    await runDbAsync('INSERT INTO consumer_state (key, value) VALUES (?, ?)', params);
    return defaultVal;
  }

  return JSON.parse(row.value);
}

async function storeState(state) {
  const stateJSON = JSON.stringify(state);
  await runDbAsync('BEGIN TRANSACTION');
  await runDbAsync('UPDATE consumer_state SET value = ? WHERE "key" = ?', [stateJSON, 'state']);
  await runDbAsync('COMMIT');
}

async function publishEvents(store) {
  const state = store.getState();
  const messages = Object.keys(state)
    .map(k => state[k].pendingMessages)
    .reduce((a, b) => a.concat(b), []);

  await kafkaProducer.init();
  for (let i = 0; i < messages.length; i += 1) {
    await kafkaProducer.send(messages[i]);
  }
  store.dispatch({ type: 'MessagesPublished' });
}

function messageToAction(topic, messageValue) {
  const messageData = JSON.parse(messageValue);
  if (messageData.type) {
    return messageData;
  }

  return { type: messageData.event.type, event: messageData.event };
}

async function handleMessageSet(store, messageSet, topic, partition) {
  for (let i = 0; i < messageSet.length; i += 1) {
    const messageValue = messageSet[i].message.value;
    const action = messageToAction(topic, messageValue);
    store.dispatch(action);
  }

  const lastOffset = messageSet[messageSet.length - 1].offset;

  await publishEvents(store);
  store.dispatch({ type: 'OffsetUpdated', topic, partition, offset: lastOffset + 1 });
  await storeState(store.getState());
}

async function main() {
  await setupDatabase();
  const currentState = await getConsumerState('state', {});
  const rootReducer = redux.combineReducers(reducers);
  const store = redux.createStore(rootReducer, currentState);

  await kafkaConsumer.init();
  const offsets = store.getState().offsets;
  console.log('offsets', offsets);
  for (let i = 0; i < TOPICS.length; i += 1) {
    const offset = offsets[TOPICS[i]] ? offsets[TOPICS[i]]['0'] : 0;
    kafkaConsumer.subscribe(TOPICS[i], 0, { offset },
                            handleMessageSet.bind(null, store));
  }
}

main();
