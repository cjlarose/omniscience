const fetch = require('node-fetch');
const querystring = require('querystring');

const apiToken = process.env.API_TOKEN;
if (!apiToken) {
  console.error('Missing API_TOKEN');
  process.exit(1);
}
const projectIdList = process.env.PROJECT_IDS;
if (!projectIdList) {
  console.error('Missing PROJECT_IDS');
  process.exit(1);
}

const projectIds = projectIdList.split(',');

async function allActivitySinceVersion(projectId, sinceVersion) {
  const headers = { 'X-TrackerToken': apiToken };
  const baseUrl = `https://www.pivotaltracker.com/services/v5/projects/${projectId}/activity`;

  function activityRequest(offset, limit) {
    const queryParams = { offset, limit };
    const url = `${baseUrl}?${querystring.stringify(queryParams)}`;
    console.log(url);
    return fetch(url, { headers });
  }

  const items = [];

  const limit = 500;
  let offset = 0;

  for (;;) {
    const resp = await activityRequest(offset, limit);
    const total = parseInt(resp.headers.get('x-tracker-pagination-total'), 10);
    const newItems = await resp.json();
    for (let i = 0; i < newItems.length; i += 1) {
      const item = newItems[i];
      if (item.project_version <= sinceVersion) {
        return items.reverse();
      }
      items.push(item);
    }
    offset += limit;
    if (offset >= total) { return items.reverse(); }
  }
}

projectIds.forEach((projectId) => {
  allActivitySinceVersion(projectId, -1)
  .then((items) => {
    console.log(items.length);
    console.log(items);
  });
});
