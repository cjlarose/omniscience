const url = require('url');
const querystring = require('querystring');
const fetch = require('node-fetch');
const parseLinkHeader = require('parse-link-header');
const { API_TOKEN, GITHUB_API_BASE_URL } = require('./config');

const requestHeaders = {
  Authorization: `token ${API_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
};

function fetchRepoEvents(owner, repo, page, perPage, etag) {
  const path = `/repos/${owner}/${repo}/events`;
  const query = querystring.stringify({ page, per_page: perPage });
  const url = `${GITHUB_API_BASE_URL}${path}?${query}`;
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
  const newUrl = `${GITHUB_API_BASE_URL}${nextUrl.path}`;
  return fetch(newUrl, { method: 'GET', headers: requestHeaders });
}

module.exports = {
  fetchRepoEvents,
  hasNextPage,
  getNextPage,
};
