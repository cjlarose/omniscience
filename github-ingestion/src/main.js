const { beginListeningToRepositoryEvents } = require('./repo_events');
const { beginWatchingKnownRepos } = require('./repo_subscription');
const { setupDatabase } = require('./db_util');

function main() {
  setupDatabase().then(() => {
    beginListeningToRepositoryEvents();
    beginWatchingKnownRepos();
  });
}

main();
