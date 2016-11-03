const redux = require('redux');
const reducers = require('./reducers/index.js');
const Kafka = require('no-kafka');
const { setupDatabase, getDbAsync, runDbAsync, execDbAsync } = require('./db_util');

const kafkaConsumer = new Kafka.SimpleConsumer({ connectionString: 'kafka:9092' });
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
  await execDbAsync(`BEGIN TRANSACTION;
    UPDATE consumer_state SET value = '${stateJSON}' WHERE "key" = 'state';
    UPDATE consumer_state SET value = '${offsetJSON}' WHERE "key" = 'offset';
    COMMIT;`);
}

async function handleMessageSet(store, messageSet) {
  for (let i = 0; i < messageSet.length; i += 1) {
    const messageData = JSON.parse(messageSet[i].message.value);
    const action = { type: messageData.event.type, event: messageData.event };
    store.dispatch(action);
  }

  const lastOffset = messageSet[messageSet.length - 1].offset;

  await storeStateAndOffset(store.getState(), lastOffset + 1);
  // TODO emit all events in reducer state
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
