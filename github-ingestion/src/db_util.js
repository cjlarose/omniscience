const sqlite3 = require('sqlite3');
const Promise = require('bluebird');

const db = new sqlite3.Database('/data/github-ingestion.db');
db.serialize();

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

function setupDatabase() {
  return Promise.all([
    runDbAsync('CREATE TABLE IF NOT EXISTS repos (owner TEXT, name TEXT, last_event_id TEXT, CONSTRAINT pk PRIMARY KEY (owner, name))'),
    runDbAsync('CREATE TABLE IF NOT EXISTS consumer_offsets (topic TEXT, offset INTEGER, CONSTRAINT pk PRIMARY KEY (topic))'),
  ]);
}

module.exports = {
  db,
  runDbAsync,
  getDbAsync,
  setupDatabase,
};
