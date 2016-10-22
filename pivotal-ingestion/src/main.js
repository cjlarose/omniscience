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

  let limit = 500;
  let offset = 0;

  top:
  while (true) {
    const resp = await activityRequest(offset, limit);
    total = parseInt(resp.headers.get('x-tracker-pagination-total'), 10);
    const newItems = await resp.json();
    for (var i = 0; i < newItems.length; i++) {
      const item = newItems[i];
      if (item.project_version <= sinceVersion)
        break top;
      items.push(item);
    };
    offset += limit;
    if (offset >= total) { break; }
  }

  return items.reverse();
}

/// activityFromVersion(0)

projectIds.forEach((projectId) => {
  allActivitySinceVersion(projectId, -1)
  .then((items) => {
    console.log(items.length);
    console.log(items);
  });
});
