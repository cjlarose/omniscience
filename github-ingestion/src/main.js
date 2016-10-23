const GithubApi = require('github');
const Bluebird = require('bluebird');

const authToken = process.env.AUTH_TOKEN;
if (!authToken) {
  console.error('Missing AUTH_TOKEN');
  process.exit(1);
}

const githubOwner = process.env.GITHUB_OWNER;
if (!githubOwner) {
  console.error('Missing GITHUB_OWNER');
  process.exit(1);
}
const githubRepo = process.env.GITHUB_REPO;
if (!githubRepo) {
  console.error('Missing GITHUB_REPO');
  process.exit(1);
}

const github = new GithubApi({ Promise: Bluebird });

github.authenticate({
  type: "oauth",
  token: authToken
});

async function getEvents(owner, repo, newerThanEventId = undefined) {
  const reqOptions = { owner, repo, page: 1, per_page: 100 };
  const events = [];

  let resp = await github.activity.getEventsForRepo(reqOptions);
  while (true) {
    for (let i = 0; i < resp.length; i++) {
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

getEvents(githubOwner, githubRepo)
.then((events) => {
  console.log(events.length);
}, (err) => {
  console.error(err);
});
