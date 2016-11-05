const redux = require('redux');
const reducers = require('./reducers/index.js');
const Kafka = require('no-kafka');
const { setupDatabase, getDbAsync, runDbAsync } = require('./db_util');

const kafkaConsumer = new Kafka.SimpleConsumer({ connectionString: 'kafka:9092' });
const kafkaProducer = new Kafka.Producer({ connectionString: 'kafka:9092' });
const EVENTS_TOPIC = 'githubEvents';

async function getConsumerState(key, defaultVal) {
  const row = await getDbAsync('SELECT value FROM consumer_state WHERE [key] = ?', [key]);
  if (!row) {
    const params = [key, JSON.stringify(defaultVal)];
    await runDbAsync('INSERT INTO consumer_state (key, value) VALUES (?, ?)', params);
    return defaultVal;
  }

  return JSON.parse(row.value);
}

async function storeStateAndOffset(state, offset) {
  const stateJSON = JSON.stringify(state);
  const offsetJSON = JSON.stringify(offset);
  await runDbAsync('BEGIN TRANSACTION');
  await runDbAsync('UPDATE consumer_state SET value = ? WHERE "key" = ?', [stateJSON, 'state']);
  await runDbAsync('UPDATE consumer_state SET value = ? WHERE "key" = ?', [offsetJSON, 'offset']);
  await runDbAsync('COMMIT');
}

async function publishEvents(store) {
  const state = store.getState();
  const messages = Object.keys(state)
    .map(k => state[k].pendingMessages)
    .reduce((a, b) => a.concat(b), []);

  await kafkaProducer.init();
  for (let i = 0; i < messages.length; i += 1) {
    await kafkaProducer.send(messages[i], { codec: Kafka.COMPRESSION_SNAPPY });
  }
  store.dispatch({ type: 'MessagesPublished' });
}

async function handleMessageSet(store, messageSet) {
  for (let i = 0; i < messageSet.length; i += 1) {
    const messageData = JSON.parse(messageSet[i].message.value);
    const action = { type: messageData.event.type, event: messageData.event };
    store.dispatch(action);
  }

  const lastOffset = messageSet[messageSet.length - 1].offset;

  await publishEvents(store);
  await storeStateAndOffset(store.getState(), lastOffset + 1);
}

async function main() {
  await setupDatabase();
  const currentState = await getConsumerState('state', {});
  const initialOffset = await getConsumerState('offset', 0);
  const rootReducer = redux.combineReducers(reducers);
  const store = redux.createStore(rootReducer, currentState);

  await kafkaConsumer.init();
  kafkaConsumer.subscribe(EVENTS_TOPIC, 0, { offset: initialOffset },
                          handleMessageSet.bind(null, store));
}

main();
