// js/app.js
document.addEventListener('DOMContentLoaded', () => {
    // Screen elements
    const screens = {
        start: document.getElementById('start-screen'),
        timerSelection: document.getElementById('timer-selection-screen'),
        countdown: document.getElementById('countdown-screen'),
        game: document.getElementById('game-screen'),
        summary: document.getElementById('summary-screen'),
    };

    // Button elements
    const buttons = {
        requestPermission: document.getElementById('request-permission-btn'),
        categoryContainer: document.getElementById('category-buttons'),
        randomAll: document.getElementById('random-all-btn'),
        backToCategories: document.getElementById('back-to-categories-btn'),
        playAgain: document.getElementById('play-again-btn'),
        changeCategory: document.getElementById('change-category-btn'),
    };

    // Display elements
    const displays = {
        selectedCategoryName: document.getElementById('selected-category-name'),
        countdownTimer: document.getElementById('countdown-timer'),
        gameTimer: document.getElementById('game-timer-display'),
        word: document.getElementById('word-display'),
        correctWordsList: document.getElementById('correct-words-list'),
        finalScore: document.getElementById('final-score'),
    };

    // Audio elements
    const audio = {
        countdown: document.getElementById('audio-countdown'),
        correct: document.getElementById('audio-correct'),
        skip: document.getElementById('audio-skip'),
        timesup: document.getElementById('audio-timesup'),
    };

    // Game state variables
    let currentCategory = '';
    let gameDuration = 60; // Default duration in seconds
    let wordList = [];
    let currentWordIndex = 0;
    let score = 0;
    let correctWords = [];
    let timerInterval = null;
    let timeLeft = 0;
    let wakeLock = null;
    let motionPermissionGranted = false;
    let currentDeviceOrientationListener = null;
    
    // Tilt mechanic states and constants
    let tiltState = 'WAITING_FOR_TILT'; // States: WAITING_FOR_TILT, ACTION_TAKEN_COOLDOWN, WAITING_FOR_NEUTRAL_RETURN
    const TILT_THRESHOLD_DOWN = 85; // Degrees for correct - requires deliberate tilt
    const TILT_THRESHOLD_UP = -85;  // Degrees for skip - requires deliberate tilt
    const NEUTRAL_ZONE_BUFFER = 30; // Degrees around 0 (flat) to be considered neutral
    const HARDWARE_COOLDOWN_MS = 500; // Cooldown after an action is registered

    // Show a specific screen and handle orientation
    function showScreen(screenName) {
        Object.values(screens).forEach(screen => screen.classList.remove('active'));
        screens[screenName].classList.add('active');

        // Manage screen orientation based on screen type
        if (screenName === 'start' || screenName === 'timerSelection') {
            if (screen.orientation && typeof screen.orientation.unlock === 'function') {
                try {
                    screen.orientation.unlock();
                    console.log(`Screen orientation unlocked for ${screenName} screen.`);
                } catch (err) {
                    console.warn(`Screen orientation unlock failed for ${screenName}:`, err.message);
                }
            }
        }
    }

    // Populate category buttons from game data
    function populateCategories() {
        // Clear existing buttons
        buttons.categoryContainer.innerHTML = '';
        
        // Create array for "Alle Begriffe"
        const allWordsCategory = [];
        
        // Create buttons for each category
        for (const categoryKey in GAME_DATA.kategorien) {
            // Add words to "Alle Begriffe" collection
            allWordsCategory.push(...GAME_DATA.kategorien[categoryKey]);
            
            // Create and add category button
            const btn = document.createElement('button');
            btn.classList.add('btn', 'category-btn');
            btn.textContent = categoryKey;
            btn.addEventListener('click', () => selectCategory(categoryKey));
            buttons.categoryContainer.appendChild(btn);
        }
        
        // Update "Alle Begriffe" in GAME_DATA (ensure unique words)
        GAME_DATA["Alle Begriffe"] = shuffleArray([...new Set(allWordsCategory)]);
    }
    
    // Handle random all button click
    buttons.randomAll.addEventListener('click', () => selectCategory("Alle Begriffe"));
    
    // Handle back to categories button click
    buttons.backToCategories.addEventListener('click', () => showScreen('start'));

    // Select a category and prepare for game
    function selectCategory(categoryName) {
        if (!motionPermissionGranted && needsMotionPermission()) {
            alert("Bitte erlaube zuerst den Zugriff auf die Bewegungssensoren.");
            return;
        }
        
        currentCategory = categoryName;
        displays.selectedCategoryName.textContent = categoryName === "Alle Begriffe" ? 
            "allen Kategorien" : categoryName;
        
        // Get words for the selected category
        let wordsForCategory = GAME_DATA.kategorien[categoryName] || GAME_DATA["Alle Begriffe"];
        
        // Handle empty category
        if (!wordsForCategory || wordsForCategory.length === 0) {
            console.warn(`Kategorie "${categoryName}" ist leer oder nicht gefunden.`);
            if (GAME_DATA["Alle Begriffe"] && GAME_DATA["Alle Begriffe"].length > 0) {
                console.warn(`Fallback zur Kategorie "Alle Begriffe".`);
                currentCategory = "Alle Begriffe";
                displays.selectedCategoryName.textContent = "allen Kategorien";
                wordsForCategory = GAME_DATA["Alle Begriffe"];
            } else {
                alert(`Die Kategorie "${categoryName}" enthält keine Wörter. Bitte wähle eine andere.`);
                return;
            }
        }
        
        // Prepare game data
        wordList = shuffleArray([...wordsForCategory]);
        currentWordIndex = 0;
        score = 0;
        correctWords = [];
        
        // Unlock orientation for timer selection
        if (screen.orientation && typeof screen.orientation.unlock === 'function') {
            try {
                screen.orientation.unlock();
                console.log('Screen orientation unlocked for timer selection.');
            } catch (err) {
                console.warn('Screen orientation unlock failed for timer selection:', err.message);
            }
        }
        
        showScreen('timerSelection');
    }

    // Set game duration based on selected timer
    function selectGameDuration(duration) {
        gameDuration = parseInt(duration, 10);
        console.log(`Game duration set to: ${gameDuration}s`);
        
        // Highlight selected timer button
        document.querySelectorAll('.timer-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.time === duration);
        });
        
        startInitialCountdown();
    }
    
    // Attach listeners for timer buttons
    document.querySelectorAll('.timer-btn').forEach(button => {
        button.addEventListener('click', (e) => selectGameDuration(e.target.dataset.time));
    });

    // Start the initial countdown before game begins
    function startInitialCountdown() {
        showScreen('countdown');
        let countdown = 3;
        displays.countdownTimer.textContent = countdown;
        
        try { 
            audio.countdown.currentTime = 0;
            audio.countdown.play(); 
        } catch(e) { 
            console.warn("Audio play failed for initial countdown sound:", e); 
        }
        
        // Clear any existing interval
        if(timerInterval) clearInterval(timerInterval);

        timerInterval = setInterval(() => {
            countdown--;
            displays.countdownTimer.textContent = countdown;
            
            if (countdown > 0) {
                try { 
                    audio.countdown.currentTime = 0;
                    audio.countdown.play(); 
                } catch(e) { 
                    console.warn("Audio play failed for countdown interval sound:", e); 
                }
            } else {
                clearInterval(timerInterval);
                timerInterval = null;
                console.log("Countdown finished, starting game.");
                startGame();
            }
        }, 1000);
    }

    // Start the game after countdown
    async function startGame() {
        if (!motionPermissionGranted && needsMotionPermission()) {
            alert("Bitte erlaube zuerst den Zugriff auf die Bewegungssensoren.");
            showScreen('start');
            return;
        }
        
        // Initialize tilt state
        tiltState = 'WAITING_FOR_TILT';
        console.log("Tilt state initialized to WAITING_FOR_TILT");

        // Lock screen to landscape for gameplay
        try {
            if (screen.orientation && typeof screen.orientation.lock === 'function') {
                await screen.orientation.lock('landscape-primary');
                console.log('Screen orientation locked to landscape-primary for game.');
            }
        } catch (err) {
            console.warn('Screen orientation lock failed for game:', err.message);
        }

        showScreen('game');
        timeLeft = gameDuration;
        updateGameTimerDisplay();
        displayNextWord(); // Display the first word

        // Start game timer
        if(timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            timeLeft--;
            updateGameTimerDisplay();
            if (timeLeft <= 0) {
                console.log("Time is up, calling endGame.");
                endGame();
            }
        }, 1000);

        startDeviceMotionListener();
        requestWakeLock();
    }
    
    // Update the game timer display
    function updateGameTimerDisplay() {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        displays.gameTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // Display the next word in the game
    function displayNextWord() {
        console.log(`displayNextWord called. Index: ${currentWordIndex}, Wordlist length: ${wordList.length}`);
        if (currentWordIndex < wordList.length) {
            const word = wordList[currentWordIndex];
            console.log(`Displaying word: ${word}`);
            displays.word.textContent = word;
            // Note: actionTakenForCurrentWord is no longer needed - handled by tiltState
        } else {
            displays.word.textContent = "Alle Wörter gespielt!";
            console.log("All words played.");
            if (timeLeft > 0) {
                stopDeviceMotionListener();
                // Game will end when timer runs out
            }
        }
    }
    
    // Visual feedback for tilt actions
    function flashScreenFeedback(type) {
        const gameScreenEl = screens.game;
        if (!gameScreenEl) return;
        
        const className = type === 'correct' ? 'screen-flash-correct' : 'screen-flash-skip';
        gameScreenEl.classList.remove('screen-flash-correct', 'screen-flash-skip');
        void gameScreenEl.offsetWidth; // Force reflow to restart animation
        gameScreenEl.classList.add(className);
    }

    // Start listening for device motion events
    function startDeviceMotionListener() {
        if (!motionPermissionGranted && needsMotionPermission()) {
            console.warn("Versuche DeviceMotion zu starten, aber keine Berechtigung.");
            return;
        }
        
        if (currentDeviceOrientationListener) {
            stopDeviceMotionListener();
        }
        
        if (window.DeviceOrientationEvent) {
            currentDeviceOrientationListener = (event) => {
                if (event.beta === null) return;
                handleTilt(event);
            };
            window.addEventListener('deviceorientation', currentDeviceOrientationListener, true);
            console.log("Device motion listener started.");
        } else {
            displays.word.textContent = "Sensor nicht unterstützt!";
            console.error("DeviceOrientationEvent nicht unterstützt.");
        }
    }

    // Stop listening for device motion events
    function stopDeviceMotionListener() {
        if (currentDeviceOrientationListener) {
            window.removeEventListener('deviceorientation', currentDeviceOrientationListener, true);
            currentDeviceOrientationListener = null;
            console.log("Device motion listener stopped.");
        }
    }

    // Handle tilt events with state machine logic
    function handleTilt(event) {
        const beta = event.beta;
        
        // Debug logging for tilt angles and state
        if (Math.abs(beta) > 5) {
            console.log(`Current beta: ${beta.toFixed(1)}°, State: ${tiltState}`);
        }

        switch (tiltState) {
            case 'WAITING_FOR_TILT':
                // Only process if we have words left
                if (currentWordIndex >= wordList.length) {
                    console.log('No more words to process');
                    break;
                }

                // Check for significant tilts beyond thresholds
                if (beta > TILT_THRESHOLD_DOWN) {
                    // CORRECT - Tilt forward/down
                    console.log(`✓ CORRECT: Tilt DOWN detected (${beta.toFixed(1)}°) for: ${wordList[currentWordIndex]}`);
                    
                    // Update score and record word
                    score++;
                    correctWords.push(wordList[currentWordIndex]);
                    
                    // Provide feedback
                    try { 
                        audio.correct.currentTime = 0; 
                        audio.correct.play(); 
                    } catch(e) { 
                        console.warn("Audio play failed for correct sound:", e); 
                    }
                    flashScreenFeedback('correct');
                    
                    // Change state and set up next word
                    tiltState = 'ACTION_TAKEN_COOLDOWN';
                    console.log(`State → ACTION_TAKEN_COOLDOWN (Correct)`);

                    setTimeout(() => {
                        currentWordIndex++; 
                        displayNextWord(); 
                        tiltState = 'WAITING_FOR_NEUTRAL_RETURN';
                        console.log(`State → WAITING_FOR_NEUTRAL_RETURN (after Correct)`);
                    }, HARDWARE_COOLDOWN_MS);

                } else if (beta < TILT_THRESHOLD_UP) {
                    // SKIP - Tilt backward/up
                    console.log(`✗ SKIP: Tilt UP detected (${beta.toFixed(1)}°) for: ${wordList[currentWordIndex]}`);
                    
                    // Provide feedback
                    try { 
                        audio.skip.currentTime = 0; 
                        audio.skip.play(); 
                    } catch(e) { 
                        console.warn("Audio play failed for skip sound:", e); 
                    }
                    flashScreenFeedback('skip');

                    // Change state and set up next word
                    tiltState = 'ACTION_TAKEN_COOLDOWN';
                    console.log(`State → ACTION_TAKEN_COOLDOWN (Skip)`);

                    setTimeout(() => {
                        currentWordIndex++; 
                        displayNextWord();
                        tiltState = 'WAITING_FOR_NEUTRAL_RETURN';
                        console.log(`State → WAITING_FOR_NEUTRAL_RETURN (after Skip)`);
                    }, HARDWARE_COOLDOWN_MS);
                }
                break;

            case 'ACTION_TAKEN_COOLDOWN':
                // Do nothing during cooldown, waiting for timeout to complete
                break;

            case 'WAITING_FOR_NEUTRAL_RETURN':
                // Only transition back to WAITING_FOR_TILT when device returns to neutral position
                if (Math.abs(beta) < NEUTRAL_ZONE_BUFFER) { 
                    console.log(`✓ NEUTRAL: Phone returned to neutral position (${beta.toFixed(1)}°)`);
                    tiltState = 'WAITING_FOR_TILT';
                    console.log(`State → WAITING_FOR_TILT (ready for next action)`);
                }
                break;
        }
    }

    // End the game and show summary
    function endGame() {
        console.log("endGame function called.");
        stopDeviceMotionListener();
        releaseWakeLock();

        // Unlock screen orientation after game
        if (screen.orientation && typeof screen.orientation.unlock === 'function') {
            try {
                screen.orientation.unlock();
                console.log('Screen orientation unlocked after game.');
            } catch (err) {
                console.warn('Screen orientation unlock failed after game:', err.message);
            }
        }

        // Stop game timer
        clearInterval(timerInterval);
        timerInterval = null;
        
        // Play end game sound
        try { 
            audio.timesup.currentTime = 0; 
            audio.timesup.play(); 
        } catch(e) { 
            console.warn("Audio play failed for timesup sound", e); 
        }
        
        // Update summary screen
        displays.finalScore.textContent = score;
        displays.correctWordsList.innerHTML = '';
        
        if (correctWords.length > 0) {
            correctWords.forEach(word => {
                const li = document.createElement('li');
                li.textContent = word;
                displays.correctWordsList.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.textContent = "Keine Begriffe richtig erraten.";
            displays.correctWordsList.appendChild(li);
        }
        
        console.log("Showing summary screen.");
        showScreen('summary');
    }

    // Play again with same category
    buttons.playAgain.addEventListener('click', () => {
        selectCategory(currentCategory); // Re-select same category (shuffles words)
    });

    // Change category
    buttons.changeCategory.addEventListener('click', () => {
        showScreen('start');
    });

    // Request wake lock to keep screen on during gameplay
    async function requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
                wakeLock.addEventListener('release', () => {
                    console.log('Screen Wake Lock released:', wakeLock.released);
                });
                console.log('Screen Wake Lock is active.');
            } catch (err) {
                console.error(`${err.name}, ${err.message}`);
            }
        } else {
            console.warn('Wake Lock API not supported.');
        }
    }

    // Release wake lock when game ends
    function releaseWakeLock() {
        if (wakeLock !== null && !wakeLock.released) {
            wakeLock.release().then(() => {
                wakeLock = null;
                console.log('Screen Wake Lock released programmatically.');
            }).catch(err => console.error('Error releasing Wake Lock:', err));
        }
    }
    
    // Shuffle array (Fisher-Yates algorithm)
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // Check if motion permission is needed
    function needsMotionPermission() {
        return typeof DeviceMotionEvent !== 'undefined' && 
               typeof DeviceMotionEvent.requestPermission === 'function';
    }

    // Initialize the app
    function initializeApp() {
        // Check if motion permission is needed (iOS 13+)
        if (needsMotionPermission()) {
            buttons.requestPermission.style.display = 'inline-block';
            document.querySelector('.permission-request-info').style.display = 'block';
            
            buttons.requestPermission.addEventListener('click', async () => {
                try {
                    const permissionState = await DeviceMotionEvent.requestPermission();
                    if (permissionState === 'granted') {
                        motionPermissionGranted = true;
                        console.log("Device motion permission granted.");
                        
                        // Hide permission elements
                        buttons.requestPermission.style.display = 'none';
                        document.querySelector('.permission-request-info').style.display = 'none';
                    } else {
                        motionPermissionGranted = false;
                        alert("Zugriff auf Bewegungssensoren verweigert. Das Spiel kann nicht ohne gespielt werden.");
                    }
                } catch (error) {
                    console.error("Error requesting device motion permission:", error);
                    alert("Fehler bei der Anforderung der Sensorberechtigung.");
                }
            });
        } else {
            // Not on iOS 13+ or permission not required by browser
            motionPermissionGranted = true;
            console.log("Device motion permission not required or already handled.");
            buttons.requestPermission.style.display = 'none';
            document.querySelector('.permission-request-info').style.display = 'none';
        }

        // Populate category buttons
        populateCategories();
        
        // Show start screen
        showScreen('start');
    }
    
    // Start the app
    initializeApp();
});

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js') // Use relative path for GitHub Pages
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(error => {
                console.log('ServiceWorker registration failed: ', error);
            });
    });
}