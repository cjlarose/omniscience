const sqlite3 = require('sqlite3');
const Promise = require('bluebird');

const db = new sqlite3.Database('/data/consumers.sqlite');
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

function execDbAsync(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function setupDatabase() {
  return runDbAsync('CREATE TABLE IF NOT EXISTS consumer_state (key TEXT, value TEXT, CONSTRAINT pk PRIMARY KEY (key))');
}

module.exports = {
  db,
  runDbAsync,
  getDbAsync,
  execDbAsync,
  setupDatabase,
};
