const Kafka = require('no-kafka');

const producer = new Kafka.Producer({
  connectionString: 'kafka:9092',
});

function publishEvent(topic, eventData) {
  const metadata = { $createdAt: new Date().toISOString() };
  const augmentedEvent = Object.assign({}, eventData, metadata);
  const message = {
    topic,
    partition: 0,
    message: { value: JSON.stringify(augmentedEvent) },
  };

  return producer.init().then(() => producer.send([message]));
}

function main() {
  const command = process.argv[2];
  const commandArgs = process.argv.slice(3);

  switch (command) {
    case 'add-repo': {
      const [owner, repo] = commandArgs;
      const eventData = { owner, repo };
      publishEvent('githubRepositories', eventData).then(() => {
        console.log(`Successfully added repository ${owner}/${repo}`);
        process.exit(0);
      });
      break;
    }
    default:
      console.error('Unknown command');
  }
}

main();
