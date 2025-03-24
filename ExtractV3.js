const axios = require('axios');
const fs = require('fs');
const PQueue = require('p-queue').default; // Ensure default export is used

// Configuration
const API_URL = 'http://35.200.185.69:8000/v3/autocomplete';
const BASE_DELAY_MS = 500;                // Base delay (ms) between requests
const JITTER_MS = 200;                    // Maximum additional jitter (ms)
const RATE_LIMIT_COOLDOWN_MS = 1000;      // Extra delay upon HTTP 429 error
const MAX_RESULTS_PER_QUERY = 15;         // Based on observed API behavior

// Valid characters for query expansion: digits, lowercase letters, plus, dot, hyphen and space represented as "%20".
const VALID_CHARACTERS = [
    ...'0123456789abcdefghijklmnopqrstuvwxyz+.-',
    '%20'
];

// Dynamic Concurrency Settings
let currentConcurrency = 26;
const MIN_CONCURRENCY = 5;
const MAX_CONCURRENCY = 80;  // Set a reasonable maximum concurrent requests
const CONCURRENCY_ADJUSTMENT_UP = 1;      // Increase by 1 for a successful request
const CONCURRENCY_ADJUSTMENT_DOWN_FACTOR = 0.9; // Decrease to 90% on a rate limit

// Backlog thresholds for dynamic adjustment
const BACKLOG_HIGH_THRESHOLD = 100; // If pending tasks exceed this, reduce concurrency
const BACKLOG_LOW_THRESHOLD = 20;   // If pending tasks are below this, try to increase concurrency

// File to save progress
const PROGRESS_FILE = 'extracted_names_dynamicV3.json';

// Global statistics
let totalRequests = 0;
const visitedPrefixes = new Set();
const discoveredNames = new Set();
let lastSavedCount = 0; // Track when we last saved progress

// Create a p-queue instance with initial concurrency and rate limiting: 80 requests per minute.
const queue = new PQueue({
    concurrency: currentConcurrency,
    intervalCap: 80,
    interval: 60000, // 60 seconds = 80 requests per minute
});

/**
 * Delay helper with jitter.
 * @param {number} ms - Base milliseconds to wait.
 * @returns {Promise<void>}
 */
function delay(ms) {
    const jitter = Math.floor(Math.random() * JITTER_MS);
    return new Promise(resolve => setTimeout(resolve, ms + jitter));
}

/**
 * Save progress to the designated file.
 */
function saveProgress() {
    const progressData = {
        totalRequests,
        totalNames: discoveredNames.size,
        names: Array.from(discoveredNames)
    };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2), 'utf-8');
    console.log(`Progress saved at ${discoveredNames.size} unique names.`);
}

/**
 * Check if it's time to save progress. Save if discoveredNames increased by at least 500 since last save.
 */
function maybeSaveProgress() {
    if (discoveredNames.size >= lastSavedCount + 500) {
        lastSavedCount = discoveredNames.size;
        saveProgress();
    }
}

/**
 * Adjust the queue's concurrency dynamically.
 * @param {number} newConcurrency 
 */
function adjustConcurrency(newConcurrency) {
    currentConcurrency = Math.max(MIN_CONCURRENCY, Math.min(MAX_CONCURRENCY, newConcurrency));
    queue.concurrency = currentConcurrency;
    console.log(`Adjusted concurrency: ${currentConcurrency}`);
}

/**
 * Periodically check the backlog and adjust concurrency.
 */
function monitorBacklog() {
    setInterval(() => {
        const pending = queue.pending; // Tasks currently running
        const size = queue.size;       // Tasks waiting in the queue
        const backlog = pending + size;
        console.log(`Backlog check - Pending: ${pending}, Queue Size: ${size}, Total Backlog: ${backlog}`);
        // If backlog is too high, reduce concurrency
        if (backlog > BACKLOG_HIGH_THRESHOLD) {
            adjustConcurrency(Math.floor(currentConcurrency * CONCURRENCY_ADJUSTMENT_DOWN_FACTOR));
        }
        // If backlog is very low and we have room to increase concurrency, do so
        else if (backlog < BACKLOG_LOW_THRESHOLD && currentConcurrency < MAX_CONCURRENCY) {
            adjustConcurrency(currentConcurrency + CONCURRENCY_ADJUSTMENT_UP);
        }
    }, 5000); // Check every 5 seconds
}

/**
 * Query the autocomplete API with enhanced error handling and exponential backoff.
 * @param {string} prefix 
 * @param {number} attempt 
 * @returns {Promise<Array<string>>}
 */
async function queryAPI(prefix, attempt = 1) {
    totalRequests++;
    try {
        const response = await axios.get(`${API_URL}?query=${encodeURIComponent(prefix)}`, {
            timeout: 520
        });
        // On success, consider increasing concurrency slowly.
        adjustConcurrency(currentConcurrency + CONCURRENCY_ADJUSTMENT_UP);
        return response.data.results || [];
    } catch (error) {
        // Handle rate limit errors (HTTP 429)
        if (error.response && error.response.status === 429) {
            adjustConcurrency(Math.floor(currentConcurrency * CONCURRENCY_ADJUSTMENT_DOWN_FACTOR));
            await delay(RATE_LIMIT_COOLDOWN_MS);
            return queryAPI(prefix, attempt + 1);
        }
        // For transient network errors, use exponential backoff up to a max number of attempts.
        else if (attempt <= 5) {
            const backoffDelay = BASE_DELAY_MS * Math.pow(2, attempt);
            console.log(`Error fetching prefix "${prefix}" (attempt ${attempt}): ${error.message}. Retrying in ${backoffDelay}ms...`);
            await delay(backoffDelay);
            return queryAPI(prefix, attempt + 1);
        } else {
            console.error(`Failed to fetch prefix "${prefix}" after ${attempt} attempts: ${error.message}`);
            return [];
        }
    }
}

/**
 * Process a prefix: query the API and, if needed, enqueue additional tasks.
 * @param {string} prefix 
 */
async function processPrefix(prefix) {
    // Avoid re-processing the same prefix
    if (visitedPrefixes.has(prefix)) return;
    visitedPrefixes.add(prefix);

    const results = await queryAPI(prefix);
    results.forEach(name => discoveredNames.add(name));

    // Check progress and save if necessary.
    maybeSaveProgress();

    // If the API returned the maximum number of results, assume more names exist for this prefix.
    if (results.length === MAX_RESULTS_PER_QUERY) {
        // Expand the prefix by iterating over the valid character set.
        for (const char of VALID_CHARACTERS) {
            const newPrefix = prefix + char;
            if (!visitedPrefixes.has(newPrefix)) {
                // Enqueue the new prefix for processing.
                queue.add(() => processPrefix(newPrefix));
            }
        }
    }

    // Delay a bit before finishing this task.
    await delay(BASE_DELAY_MS);
}

/**
 * Initialize the extraction process by enqueueing all single-character prefixes.
 */
async function extractAllNames() {
    console.log('Starting dynamic concurrent extraction using valid character set...');
    const startTime = Date.now();

    // Start backlog monitoring.
    monitorBacklog();

    // Enqueue initial tasks for each valid character.
    for (const char of VALID_CHARACTERS) {
        queue.add(() => processPrefix(char));
    }

    // Wait for all tasks in the queue to finish.
    await queue.onIdle();

    // Save final progress before finishing.
    saveProgress();

    const secondsElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n===== Extraction Complete =====');
    console.log(`Total Requests Made: ${totalRequests}`);
    console.log(`Total Names Found: ${discoveredNames.size}`);
    console.log(`Time Elapsed: ${secondsElapsed} seconds`);

    return {
        totalRequests,
        totalNames: discoveredNames.size,
        names: Array.from(discoveredNames),
        timeElapsedSeconds: parseFloat(secondsElapsed)
    };
}

/**
 * Save JSON data to a file.
 * @param {string} filename 
 * @param {Object} data 
 */
function saveToFile(filename, data) {
    fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Saved results to ${filename}`);
}

// Run the extraction process and save the outputs.
extractAllNames()
    .then(results => {
        saveToFile(PROGRESS_FILE, results);
        saveToFile('names_only_dynamicV3.json', results.names);
    })
    .catch(err => {
        console.error('Extraction failed:', err);
    });
