const redux = require('redux');
const reducers = require('./reducers/index.js');
const Kafka = require('no-kafka');

const kafkaConsumer = new Kafka.SimpleConsumer({ connectionString: 'kafka:9092' });
const EVENTS_TOPIC = 'githubEvents';

async function main() {
  const rootReducer = redux.combineReducers(reducers);
  const store = redux.createStore(rootReducer); // TODO fill initial store state from db

  // TODO get initial offset from db
  const initialOffset = 0;

  await kafkaConsumer.init();
  kafkaConsumer.subscribe(EVENTS_TOPIC, 0, { offset: initialOffset }, (messageSet) => {
    for (let i = 0; i < messageSet.length; i += 1) {
      const messageData = JSON.parse(messageSet[i].message.value);
      const action = { type: messageData.event.type, event: messageData.event };
      store.dispatch(action);
    }

    console.log('store state');
    console.log(JSON.stringify(store.getState(), null, 2));
    console.log('end store state');
    // TODO emit all events in reducer state
    // TODO store state in db
    // TODO update offset in db
  });
}

main();
