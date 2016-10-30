const authToken = process.env.API_TOKEN;
if (!authToken) {
  console.error('Missing API_TOKEN');
  process.exit(1);
}

module.exports = {
  KAFKA_CONNECTION_STRING: 'kafka:9092',
  API_TOKEN: authToken,
  GITHUB_HOST: process.env.GITHUB_HOST || 'api.github.com',
  GITHUB_PORT: process.env.GITHUB_PORT || 443,
  GITHUB_SCHEME: process.env.GITHUB_SCHEME || 'https',
};
