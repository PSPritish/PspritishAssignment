# Autocomplete API Extraction

This project provides three different extraction solutions for an autocomplete API hosted at `http://35.200.185.69:8000`. Each version targets a different endpoint (`/v1/autocomplete`, `/v2/autocomplete`, and `/v3/autocomplete`) with its own parameters and rate-limiting constraints.

The extraction process recursively queries the API using a defined character set and expands the search space based on the returned results. All approaches use dynamic concurrency adjustments, exponential backoff, and periodic progress saving.

---

## Common Concepts

- **Recursive Prefix Expansion:**  
  Each solution starts by querying the API with a set of single-character prefixes. If the returned results equal the maximum result count, the prefix is expanded by appending valid characters.

- **Rate Limiting & Concurrency:**  
  All versions use the [p-queue](https://www.npmjs.com/package/p-queue) package to limit the number of requests per minute and adjust concurrency dynamically based on the backlog.

- **Error Handling:**  
  Each approach implements exponential backoff for transient errors and a cooldown for HTTP 429 (rate limit) responses.

- **Progress Saving:**  
  Extraction progress is periodically saved to a JSON file, preserving the total requests made, unique names discovered, and a list of names.

---

## API Versions Overview

### Version 1 (v1)
- **Endpoint:** `/v1/autocomplete`
- **Valid Character Set:**  
  `abcdefghijklmnopqrstuvwxyz`
- **Rate Limit:**  
  100 requests per minute.
- **Maximum Results per Query:**  
  10 results.
- **Details:**  
  The original v1 approach was updated to use the given character set instead of iterating over an ASCII range. It schedules initial queries for each letter in the valid character set and recursively expands when results hit the maximum threshold.

### Version 2 (v2)
- **Endpoint:** `/v2/autocomplete`
- **Valid Character Set:**  
  `0123456789abcdefghijklmnopqrstuvwxyz`
- **Rate Limit:**  
  50 requests per minute.
- **Maximum Results per Query:**  
  12 results.
- **Details:**  
  In this version, the valid character set is extended to include digits along with lowercase letters. The p‑queue is configured to process only 50 requests per minute to stay within the API's constraints.

### Version 3 (v3)
- **Endpoint:** `/v3/autocomplete`
- **Valid Character Set:**  
  `0123456789abcdefghijklmnopqrstuvwxyz+.-%20`  
  (Note: `%20` represents a space character.)
- **Rate Limit:**  
  80 requests per minute.
- **Maximum Results per Query:**  
  15 results.
- **Details:**  
  The v3 solution further extends the valid character set to include additional symbols (`+`, `.`, `-`) and a space (encoded as `%20`). It is configured with an 80 requests per minute limit. This version may generate more requests due to finer granularity in prefix expansion.

---

## Project Structure

```
├── README.md               # This file
├── Extract.js        # Code for v1 extraction
├── ExtractV2.js        # Code for v2 extraction
├── ExtractV3.js        # Code for v3 extraction
├── api-rate-limit-test.js # to check is there any rate limit present in api
├─- Testing.js # to find out output structure and what is the valid input characters present in the database
├─- extracted_names_dynamic.json # contains all names, no. of request, no. of names and run time for v1
├─- extracted_names_dynamicV2.json # contains all names, no. of request, no. of names and run time for v2
├─- extracted_names_dynamicV3.json # contains all names, no. of request, no. of names and run time for v3
```

Each file contains a self-contained script for extracting names from the corresponding API endpoint.

---

## Installation

1. **Clone the repository:**

   ```bash
   git clone [github link](https://github.com/PSPritish/PspritishAssignment.git)
   cd pspritishAssignment
   ```

2. **Install Dependencies:**

   ```bash
   npm install
   ```

   Dependencies include:
   - [axios](https://www.npmjs.com/package/axios) for HTTP requests.
   - [p-queue](https://www.npmjs.com/package/p-queue) for managing concurrent requests.
   - Node.js built-in [fs](https://nodejs.org/api/fs.html) for file operations.

---

## Usage

To run a specific extraction version, execute the corresponding script:

- **For Version 1:**

  ```bash
  node Extract.js
  ```

- **For Version 2:**

  ```bash
  node ExtractV2.js
  ```

- **For Version 3:**

  ```bash
  node ExtractV3.js
  ```

Each script will:
- Query the API with initial prefixes from the defined valid character set.
- Expand the search space recursively when the API returns the maximum number of results.
- Handle rate limits and adjust concurrency dynamically.
- Save progress to JSON files (e.g., `extracted_names_dynamicV1.json`, `extracted_names_dynamicV2.json`, `extracted_names_dynamicV3.json`).

---

## Expected Run Time

The time required to explore the entire search space depends on:
- **API Behavior:** How many results each query returns.
- **Data Distribution:** The density of names for different prefixes.
- **Rate Limits:** Configured to 100, 50, or 80 requests per minute for v1, v2, and v3 respectively.
- **Network Conditions:** Any additional delays from transient errors or rate limiting.

In ideal conditions, extraction might complete in a few hours. In worst-case scenarios, deep recursive searches could take several hours or even days.

---

## Troubleshooting

- **Rate Limiting:**  
  The scripts implement exponential backoff and cooldown on HTTP 429 errors. Monitor console logs for rate limit messages.

- **Incomplete Data:**  
  Progress is saved periodically. If extraction stops unexpectedly, you can resume from the saved progress file.

- **Logging:**  
  Detailed logs (backlog, request count, unique names count) are printed to the console to help monitor progress and debug issues.



## Acknowledgements

- **axios:** For HTTP requests.
- **p-queue:** For managing concurrency and rate limiting.
- This project demonstrates a systematic approach to extracting data from undocumented APIs.
