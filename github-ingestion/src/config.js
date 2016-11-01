const authToken = process.env.API_TOKEN;
if (!authToken) {
  console.error('Missing API_TOKEN');
  process.exit(1);
}

module.exports = {
  KAFKA_CONNECTION_STRING: 'kafka:9092',
  API_TOKEN: authToken,
  GITHUB_API_BASE_URL: process.env.GITHUB_API_BASE_URL || 'https://api.github.com',
};
