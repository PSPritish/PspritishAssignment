/**
 * Node.js script to test and identify API rate limits by repeatedly sending requests.
 *
 * Usage:
 *   1. Run: npm install node-fetch
 *   2. node api-rate-limit-test.js
 */



const API_URL = 'http://35.200.185.69:8000/v3/autocomplete?query=a';
const REQUEST_INTERVAL_MS = 0;
let requestCount = 0;

async function main() {
  console.log('Starting API rate limit test...');
  let rateLimited = false;
  let rateLimitStartTime = null;
  let cooldownDuration = null;

  while (true) {
    try {
      const response = await fetch(API_URL);
      if (rateLimited == false) {
        requestCount++;
      }

      if (response.status === 429) {
        // Rate-limited
        if (rateLimited == false)
          console.log(`Rate limit reached after ${requestCount} requests.`);
        rateLimited = true;
        rateLimitStartTime = Date.now();
      } else if (response.ok) {
        // Successful response
        if (rateLimited) {
          // Rate limit was active, check cooldown
          cooldownDuration = Date.now() - rateLimitStartTime;
          console.log(`Cooldown ended. Approx. cooldown: ${cooldownDuration} ms`);
          break;
        }
      } else {
        console.log(`Received status ${response.status} at request #${requestCount}`);
      }
    } catch (error) {
      console.error(`Request #${requestCount} failed with error:`, error);
    }

    // Simple throttle between requests
    await new Promise(resolve => setTimeout(resolve, REQUEST_INTERVAL_MS));
  }

  console.log('API rate limit test finished.');
  console.log(`Total requests made: ${requestCount}`);
  if (cooldownDuration !== null) {
    console.log(`Estimated cooldown duration: ${cooldownDuration} ms`);
  }
}

main().catch(err => console.error('Unexpected error:', err));