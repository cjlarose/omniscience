const url = require('url');
const querystring = require('querystring');
const fetch = require('node-fetch');
const parseLinkHeader = require('parse-link-header');
const { API_TOKEN, GITHUB_SCHEME, GITHUB_HOST, GITHUB_PORT } = require('./config');

const githubBaseUrl = `${GITHUB_SCHEME}://${GITHUB_HOST}:${GITHUB_PORT}`;

const requestHeaders = {
  Authorization: `token ${API_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
};

function fetchRepoEvents(owner, repo, page, perPage, etag) {
  const path = `/repos/${owner}/${repo}/events`;
  const query = querystring.stringify({ page, per_page: perPage });
  const url = `${githubBaseUrl}${path}?${query}`;
  const headers = Object.assign({}, requestHeaders, { 'If-None-Match': etag });
  return fetch(url, { method: 'GET', headers });
}

function hasNextPage(resp) {
  const headerValue = resp.headers.get('Link');
  if (!headerValue) {
    return false;
  }
  const links = parseLinkHeader(headerValue);
  return typeof links.next !== 'undefined';
}

function getNextPage(resp) {
  const links = parseLinkHeader(resp.headers.get('Link'));
  const nextUrl = url.parse(links.next.url);
  const newUrl = `${githubBaseUrl}${nextUrl.path}`;
  return fetch(newUrl, { method: 'GET', headers: requestHeaders });
}

module.exports = {
  fetchRepoEvents,
  hasNextPage,
  getNextPage,
};
