import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// --- CONFIGURATION ---
const TWITTER_URL = 'https://x.com/';
const HOME_URL = 'https://x.com/home'; // The expected URL after successful login
const TWEET_JSON_FILE = path.join(__dirname, '../tweets.json'); // Path to your tweets.json
const MEDIA_BASE_PATH = path.join(__dirname, '../media'); // Folder where your images/videos are

const TWEETS_PER_DAY = 8;
const TOTAL_DAYS_TO_SCHEDULE = 200; // Schedule for 200 days

// IMPORTANT: HARDCODED CREDENTIALS - USE WITH EXTREME CAUTION!
const TWITTER_EMAIL = '';
const TWITTER_PASSWORD = ''; // <--- REPLACE THIS WITH YOUR REAL PASSWORD!
const TWITTER_USERNAME = ''; // <--- YOUR TWITTER USERNAME

// Current location is Pune, Maharashtra, India (IST) - Time calculations are based on this.
const OPTIMAL_IST_TIMES = [
    { hour: 12, minute: 45 }, { hour: 14, minute: 15 }, { hour: 17, minute: 45 },
    { hour: 19, minute: 0 }, { hour: 21, minute: 30 }, { hour: 22, minute: 45 },
    { hour: 2, minute: 45 }, { hour: 4, minute: 15 }
];

if (OPTIMAL_IST_TIMES.length < TWEETS_PER_DAY) {
    throw new Error(`Not enough optimal time slots (${OPTIMAL_IST_TIMES.length}) defined for ${TWEETS_PER_DAY} tweets per day.`);
}

// --- SELECTORS (!!! CRITICAL: YOU MUST VERIFY AND UPDATE THESE !!!) ---
const SELECTORS = {
    // General UI Selectors (for composing/scheduling tweets)
    tweetButton: 'a[data-testid="SideNav_NewTweet_Button"]', // Updated to use testId directly
    tweetTextAreaParent: 'div[data-testid="tweetTextarea_0"]', // Parent container of the text area
    mediaInput: 'input[data-testid="fileInput"]',
    scheduleButton: 'div[aria-label="Schedule post"]', // Updated to use aria-label and role in code
    
    // New/Updated Date Picker Selectors based on codegen
    datePickerDaySelect: 'select[aria-label="Day"]',
    datePickerHourSelect: 'select[aria-label="Hour, current value"]',
    datePickerMinuteSelect: 'select[aria-label="Minute"]',
    datePickerAMPMSelect: 'select[aria-label="AM/PM"]',
    scheduleConfirmButton: 'button[data-testid="scheduledConfirmationPrimaryAction"]', // Replaces datePickerConfirmButton

    scheduleFinalButton: 'button[data-testid="tweetButton"]', // This is the 'Post' button after scheduling
    
    // --- Login Specific Selectors ---
    loginFormEmailInput: 'input[autocomplete="username"]',
    loginFormNextButton: 'button[role="button"]:has-text("Next")',
    loginFormPasswordInput: 'input[autocomplete="current-password"]',
    loginFormLoginButton: 'button[data-testid="LoginForm_Login_Button"]', 
    
    // Selectors for Username step
    usernameInput: 'input[name="text"]',
    usernameNextButton: 'button[role="button"]:has-text("Next")',
};

/**
 * Performs Twitter login using hardcoded credentials, handling the username step.
 * @param page Playwright Page object
 */
async function performLogin(page: Page) {
    console.log('Attempting login with hardcoded credentials...');

    await page.goto(TWITTER_URL + 'i/flow/login', { waitUntil: 'domcontentloaded' });

    // 1. Enter Email/Username for the initial step
    console.log('Entering email...');
    await page.waitForSelector(SELECTORS.loginFormEmailInput, { state: 'visible', timeout: 10000 });
    await page.locator(SELECTORS.loginFormEmailInput).fill(TWITTER_EMAIL);
    await page.locator(SELECTORS.loginFormNextButton).click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000); // Give UI time to transition

    // --- Handle the intermediate Username step if it appears ---
    try {
        await page.waitForSelector(SELECTORS.usernameInput, { state: 'visible', timeout: 5000 });
        
        console.log('Username prompt detected. Entering username...');
        await page.locator(SELECTORS.usernameInput).fill(TWITTER_USERNAME);
        await page.locator(SELECTORS.usernameNextButton).click(); // Click 'Next' after entering username
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1000); // Give UI time to transition to password field
        
    } catch (error) {
        console.log('No specific username prompt detected, proceeding to password (or assuming it was combined).');
    }

    // 2. Enter Password
    console.log('Entering password...');
    await page.waitForSelector(SELECTORS.loginFormPasswordInput, { state: 'visible', timeout: 10000 });
    await page.locator(SELECTORS.loginFormPasswordInput).fill(TWITTER_PASSWORD);

    // 3. Click Final Login button
    console.log('Clicking final login button...');
    await page.locator(SELECTORS.loginFormLoginButton).click({ timeout: 60000 }); 

    // Wait for successful navigation to the home URL (this worked last time!)
    await page.waitForURL(HOME_URL, { timeout: 20000 }); 
    
    // Instead of networkidle, wait for a key element on the home page, like the "Tweet" button
    console.log('Waiting for Tweet button on home page to confirm full load...');
    await page.waitForSelector(SELECTORS.tweetButton, { state: 'visible', timeout: 20000 }); 
    
    console.log('Login successful and home page ready!');
}

test.describe('Twitter Tweet Scheduler', () => {
    let tweets: any[];

    test.beforeAll(async () => {
        try {
            const data = fs.readFileSync(TWEET_JSON_FILE, 'utf8');
            tweets = JSON.parse(data);
            console.log(`Loaded ${tweets.length} tweets from ${TWEET_JSON_FILE}`);
            if (tweets.length === 0) {
                console.error("No tweets found in tweets.json. Please add content.");
                process.exit(1);
            }
        } catch (error) {
            console.error('Error loading tweets.json:', error);
            process.exit(1);
        }
    });

    test('Schedule all tweets for 200 days', async ({ page }) => {
        await performLogin(page);
        
        let scheduledCount = 0;

        for (let day = 0; day < TOTAL_DAYS_TO_SCHEDULE; day++) {
            console.log(`\n--- Scheduling for Day ${day + 1} ---`);

            if (scheduledCount >= tweets.length) {
                console.log(`All ${tweets.length} tweets from the JSON file have been processed. Exiting outer loop.`);
                break;
            }

            for (let i = 0; i < TWEETS_PER_DAY; i++) {
                const tweetIndex = (day * TWEETS_PER_DAY) + i;

                if (tweetIndex >= tweets.length) {
                    console.log(`No more tweets left in JSON for current day's slot. Moving to next day's cycle.`);
                    break;
                }

                const tweet = tweets[tweetIndex];
                const { tweet_text, media_path, type } = tweet;

                const scheduleDateTime = new Date();
                scheduleDateTime.setDate(scheduleDateTime.getDate() + day);
                
                const optimalTime = OPTIMAL_IST_TIMES[i % OPTIMAL_IST_TIMES.length];
                scheduleDateTime.setHours(optimalTime.hour, optimalTime.minute, 0, 0);

                const now = new Date();
                // Ensure the scheduled time is at least 5 minutes in the future from now
                if (scheduleDateTime.getTime() < now.getTime() + (5 * 60 * 1000)) {
                    scheduleDateTime.setDate(scheduleDateTime.getDate() + 1);
                    scheduleDateTime.setHours(optimalTime.hour, optimalTime.minute, 0, 0);
                    console.log(`  Adjusted schedule for tweet ${tweet.id} to next day as time was in the past/too soon.`);
                }

                const formattedDay = scheduleDateTime.getDate().toString(); // Day of the month
                let formattedHour = scheduleDateTime.getHours();
                const formattedMinute = scheduleDateTime.getMinutes().toString();
                let ampm = 'am';

                if (formattedHour >= 12) {
                    ampm = 'pm';
                    if (formattedHour > 12) {
                        formattedHour -= 12;
                    }
                } else if (formattedHour === 0) {
                    formattedHour = 12; // 12 AM
                }
                
                console.log(`  Scheduling tweet ${tweet.id} for: ${scheduleDateTime.toLocaleDateString()} ${formattedHour}:${formattedMinute} ${ampm} IST`);
                console.log(`  Tweet text preview: "${tweet_text.substring(0, 70)}..."`);

                try {
                    // Click the "Post" button (using data-testid="SideNav_NewTweet_Button")
                    await page.locator(SELECTORS.tweetButton).click();
                    
                    // Wait for the tweet text area's parent container to be visible
                    await page.waitForSelector(SELECTORS.tweetTextAreaParent, { state: 'visible', timeout: 10000 });

                    // --- NEW: More robust interaction with the tweet text area ---
                    const tweetTextArea = page.getByRole('textbox', { name: 'Post text' });
                    // Wait for the specific textbox to be visible
                    await tweetTextArea.waitFor({ state: 'visible', timeout: 5000 });
                    // REMOVED: await tweetTextArea.waitFor({ state: 'editable', timeout: 5000 }); // This line caused the error
                    await tweetTextArea.focus(); // Explicitly focus it
                    await tweetTextArea.type(tweet_text, { delay: 50 }); // Use type with a delay

                    // Attach media if provided
                    if (media_path) {
                        const fullMediaPath = path.join(MEDIA_BASE_PATH, media_path);
                        if (fs.existsSync(fullMediaPath)) {
                            console.log(`  Attaching media: ${fullMediaPath}`);
                            await page.locator(SELECTORS.mediaInput).setInputFiles(fullMediaPath);
                            await page.waitForTimeout(7000); // Give time for media to upload/preview
                        } else {
                            console.warn(`  Media file not found: ${fullMediaPath}. Skipping media for tweet ${tweet.id}.`);
                        }
                    }

                    // Click the "Schedule post" button (using getByRole for "Schedule post")
                    await page.getByRole('button', { name: 'Schedule post' }).click();
                    
                    // Wait for the schedule picker to appear (e.g., the Day select box)
                    await page.waitForSelector(SELECTORS.datePickerDaySelect, { state: 'visible', timeout: 10000 });

                    // Select Date and Time using new selectors from codegen
                    await page.locator(SELECTORS.datePickerDaySelect).selectOption(formattedDay);
                    await page.locator(SELECTORS.datePickerHourSelect).selectOption(formattedHour.toString());
                    await page.locator(SELECTORS.datePickerMinuteSelect).selectOption(formattedMinute.padStart(2, '0'));
                    await page.locator(SELECTORS.datePickerAMPMSelect).selectOption(ampm);
                    
                    await page.waitForTimeout(500); // Small pause for UI update

                    // Click the confirm button in the schedule picker
                    await page.locator(SELECTORS.scheduleConfirmButton).click();

                    // Short pause before the final post button appears/becomes clickable
                    await page.waitForTimeout(1000); 

                    // Click the final "Post" (Schedule) button
                    await page.locator(SELECTORS.scheduleFinalButton).click();

                    // Wait for the tweet text area to clear or disappear, indicating post is submitted
                    await page.waitForFunction(selector => {
                        const el = document.querySelector(selector);
                        // Check if the element exists and its text content is empty or null (meaning it's cleared)
                        return el && (el.textContent === null || el.textContent.trim() === '');
                    }, SELECTORS.tweetTextAreaParent, { timeout: 15000 });


                    console.log(`  Tweet ${tweet.id} successfully scheduled.`);
                    scheduledCount++;
                    await page.waitForTimeout(3000); // Pause before next tweet
                } catch (error) {
                    console.error(`  Failed to schedule tweet ${tweet.id}:`, error);
                    console.error("  This is likely due to a selector change or a temporary UI issue. Reloading page and attempting next tweet.");
                    await page.reload();
                    await page.waitForSelector(SELECTORS.tweetButton, { state: 'visible', timeout: 20000 }); // Wait for home page to load
                    await page.waitForTimeout(5000);
                }
            }
        }
        console.log(`\n--- Scheduling complete! Total tweets attempted to schedule: ${scheduledCount} ---`);
    });
});