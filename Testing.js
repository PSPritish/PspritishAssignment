const axios = require('axios');

const API_URL = 'http://35.200.185.69:8000/v3/autocomplete';

/**
 * Explores API behavior through various tests
 */
async function exploreAPI() {
    console.log('===== API EXPLORATION =====');

    // Test 1: Basic structure and response format
    try {
        console.log('\n>> TESTING RESPONSE STRUCTURE:');
        const response = await axios.get(`${API_URL}?query=a`);
        const data = JSON.stringify(response.data);
        console.log('Response structure:');
        console.log(data);
    } catch (error) {
        console.error('Error testing response structure:', error.message);
    }

    // Test 2: Single character queries
    try {
        console.log('\n>> TESTING SUPPORTED ASCII CHARACTERS:');
        const validCharacters = [];
        for (let i = 33; i <= 126; i++) { // ASCII printable characters range
            const char = String.fromCharCode(i);
            let retry = true;
            while (retry) {
                try {
                    const response = await axios.get(`${API_URL}?query=${encodeURIComponent(char)}`);
                    // console.log(`"${char}" (ASCII ${i}) → Supported, ${response.data.results.length} results`);
                    if (response.data.results.length > 0) {
                        validCharacters.push(char); // Add valid character to the list
                    }
                    retry = false; // Exit retry loop on success
                } catch (error) {
                    if (error.response && error.response.status === 429) {
                        // console.log(`"${char}" (ASCII ${i}) → Rate limited, retrying after delay...`);
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Delay before retry
                    } else {
                        // console.log(`"${char}" (ASCII ${i}) → Not supported, Error: ${error.message}`);
                        retry = false; // Exit retry loop on non-rate-limit errors
                    }
                }
            }
            await new Promise(resolve => setTimeout(resolve, 300)); // Delay between characters
        }
        console.log('\nValid characters:', validCharacters.join(''));
    } catch (error) {
        console.error('Error testing supported ASCII characters:', error.message);
    }
}

// Run the exploration
exploreAPI();
