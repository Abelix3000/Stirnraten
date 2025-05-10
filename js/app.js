// js/app.js
document.addEventListener('DOMContentLoaded', () => {
    const screens = {
        start: document.getElementById('start-screen'),
        timerSelection: document.getElementById('timer-selection-screen'),
        countdown: document.getElementById('countdown-screen'),
        game: document.getElementById('game-screen'),
        summary: document.getElementById('summary-screen'),
    };

    const buttons = {
        categoryContainer: document.getElementById('category-buttons'),
        randomAll: document.getElementById('random-all-btn'),
        requestPermission: document.getElementById('request-permission-btn'),
        backToCategories: document.getElementById('back-to-categories-btn'),
        playAgain: document.getElementById('play-again-btn'),
        changeCategory: document.getElementById('change-category-btn'),
    };

    const displays = {
        selectedCategoryName: document.getElementById('selected-category-name'),
        countdownTimer: document.getElementById('countdown-timer'),
        gameTimer: document.getElementById('game-timer-display'),
        word: document.getElementById('word-display'),
        correctWordsList: document.getElementById('correct-words-list'),
        finalScore: document.getElementById('final-score'),
    };

    const audio = {
        countdown: document.getElementById('audio-countdown'),
        correct: document.getElementById('audio-correct'),
        skip: document.getElementById('audio-skip'),
        timesup: document.getElementById('audio-timesup'),
    };

    let currentCategory = '';
    let gameDuration = 60; // Default, seconds
    let wordList = [];
    let currentWordIndex = 0;
    let score = 0;
    let correctWords = [];
    let timerInterval;
    let timeLeft = 0;
    let wakeLock = null;
    let actionTakenForCurrentWord = false;
    let motionPermissionGranted = false;
    let currentDeviceOrientationListener = null; // Variable to hold the current listener
    let lastBetaForDebounce = 0; // For debouncing tilt events

    const TILT_THRESHOLD_DOWN = 85; // Degrees for correct, significantly increased
    const TILT_THRESHOLD_UP = -85;  // Degrees for skip, significantly increased
    const NEUTRAL_ZONE_BUFFER = 15; // Degrees around 0 to ignore
    const ACTION_COOLDOWN_MS = 750; // Milliseconds to wait before processing another tilt action
    let isActionOnCooldown = false;

    function showScreen(screenName) {
        Object.values(screens).forEach(screen => screen.classList.remove('active'));
        screens[screenName].classList.add('active');
    }

    function populateCategories() {
        buttons.categoryContainer.innerHTML = ''; // Clear existing
        GAME_DATA["Alle Begriffe"] = Object.values(GAME_DATA.kategorien).flat(); // Populate "All" category

        for (const categoryName in GAME_DATA.kategorien) {
            const btn = document.createElement('button');
            btn.classList.add('btn', 'category-btn');
            btn.textContent = categoryName;
            btn.addEventListener('click', () => selectCategory(categoryName));
            buttons.categoryContainer.appendChild(btn);
        }
    }
    
    buttons.randomAll.addEventListener('click', () => selectCategory("Alle Begriffe"));

    function selectCategory(categoryName) {
        if (!motionPermissionGranted) {
            alert("Bitte erlaube zuerst den Zugriff auf die Bewegungssensoren.");
            return;
        }
        currentCategory = categoryName;
        displays.selectedCategoryName.textContent = categoryName === "Alle Begriffe" ? "allen Kategorien" : categoryName;
        wordList = shuffleArray([...GAME_DATA.kategorien[currentCategory] || GAME_DATA["Alle Begriffe"]]);
        showScreen('timerSelection');
    }

    document.querySelectorAll('.timer-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            gameDuration = parseInt(btn.dataset.time);
            document.querySelectorAll('.timer-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            // Add a start game button dynamically or make one visible
            // For now, let's assume selecting a timer starts the countdown phase
            startInitialCountdown();
        });
    });
    
    buttons.backToCategories.addEventListener('click', () => showScreen('start'));

    async function requestMotionPermission() {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const permissionState = await DeviceMotionEvent.requestPermission();
                if (permissionState === 'granted') {
                    motionPermissionGranted = true;
                    buttons.requestPermission.style.display = 'none';
                    document.querySelector('.permission-request-info').style.display = 'none';
                } else {
                    alert('Zugriff auf Bewegungssensoren verweigert. Das Spiel kann nicht ohne gespielt werden.');
                }
            } catch (error) {
                console.error('Fehler bei der Anforderung der Bewegungssensor-Berechtigung:', error);
                // Fallback for browsers that don't need explicit permission or throw error
                motionPermissionGranted = true; 
                 buttons.requestPermission.style.display = 'none';
                 document.querySelector('.permission-request-info').style.display = 'none';
            }
        } else {
            // For browsers that don't require explicit permission (e.g., Android Chrome)
            motionPermissionGranted = true;
            buttons.requestPermission.style.display = 'none';
            document.querySelector('.permission-request-info').style.display = 'none';
        }
    }
    
    buttons.requestPermission.addEventListener('click', requestMotionPermission);

    // --- Game Logic Helper: Shuffle Words ---
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]]; // ES6 destructuring swap
        }
        return array;
    }

    // --- Category and Timer Selection ---
    function handleCategorySelection(categoryName) {
        currentCategory = categoryName;
        displays.selectedCategoryName.textContent = categoryName === "Alle Begriffe" ? "allen Kategorien" : categoryName;
        
        let allWords = [];
        if (!window.gameData || !window.gameData.categories) {
            console.error('gameData not available for category selection.');
            alert('Fehler: Spieldaten nicht gefunden. Bitte Seite neu laden.');
            return;
        }

        if (categoryName === "Alle Begriffe") {
            for (const cat in window.gameData.kategorien) {
                allWords = allWords.concat(window.gameData.kategorien[cat]);
            }
        } else if (window.gameData.kategorien[currentCategory]) {
            allWords = window.gameData.kategorien[currentCategory];
        } else {
            console.error(`Category "${currentCategory}" not found in gameData.`);
            alert('Fehler: Ausgewählte Kategorie nicht gefunden.');
            return;
        }

        if (allWords.length === 0) {
            alert(`Die Kategorie "${currentCategory}" enthält keine Wörter. Bitte wähle eine andere.`);
            return;
        }

        wordList = shuffleArray([...allWords]);
        currentWordIndex = 0;
        score = 0;
        correctWords = [];
        showScreen('timerSelection');
    }

    function selectGameDuration(duration) {
        gameDuration = parseInt(duration, 10);
        console.log(`Game duration set to: ${gameDuration}s`);
        // Optional: Highlight selected timer button
        document.querySelectorAll('.timer-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.time === duration);
        });
        startInitialCountdown();
    }
    
    // Attach listeners for timer buttons (should be done once)
    document.querySelectorAll('.timer-btn').forEach(button => {
         button.addEventListener('click', (e) => selectGameDuration(e.target.dataset.time));
    });

    // --- Countdown and Game Start ---
    function startInitialCountdown() {
        showScreen('countdown');
        let countdown = 3;
        displays.countdownTimer.textContent = countdown;
        try { audio.countdown.play(); } catch(e) { console.warn("Audio play failed for initial countdown sound:", e); } // Play once at the start
        
        // Clear any existing interval to prevent multiple countdowns
        if(timerInterval) clearInterval(timerInterval);

        timerInterval = setInterval(() => {
            countdown--;
            displays.countdownTimer.textContent = countdown;
            if (countdown > 0) {
                try { audio.countdown.play(); } catch(e) { console.warn("Audio play failed for countdown interval sound:", e); } // Play on each subsequent second
            } else {
                clearInterval(timerInterval);
                timerInterval = null; // Good practice to nullify cleared interval IDs
                startGame();
            }
        }, 1000);
    }

    async function startGame() {
        if (!motionPermissionGranted) {
            alert("Bitte erlaube zuerst den Zugriff auf die Bewegungssensoren.");
            showScreen('start'); // Go back to start to request permission
            return;
        }
        // Attempt to lock screen orientation
        try {
            if (screen.orientation && typeof screen.orientation.lock === 'function') {
                await screen.orientation.lock('landscape-primary');
                console.log('Screen orientation locked to landscape-primary.');
            }
        } catch (err) {
            console.warn('Screen orientation lock failed:', err.message);
            // Continue game even if lock fails
        }

        showScreen('game');
        timeLeft = gameDuration;
        updateGameTimerDisplay();
        displayNextWord();

        // Screen Wake Lock
        if ('wakeLock' in navigator) {
            try {
                if (wakeLock) { // Release any existing lock first
                    await wakeLock.release();
                    wakeLock = null;
                }
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('Screen Wake Lock is active.');
                wakeLock.addEventListener('release', () => {
                    // This event is fired if the lock is released by the system, e.g. tab hidden
                    console.log('Screen Wake Lock was released by the system.');
                    // No need to re-request here unless gameplay is still active and tab becomes visible again
                });
            } catch (err) {
                console.error(`Wake Lock error: ${err.name}, ${err.message}`);
            }
        }

        // Clear any existing game timer interval
        if(timerInterval) clearInterval(timerInterval);

        timerInterval = setInterval(() => {
            timeLeft--;
            updateGameTimerDisplay();
            if (timeLeft <= 0) {
                endGame(); // endGame will clear this interval too
            }
        }, 1000);
        startDeviceMotionListener(); // Start listening for tilts
    }

    // --- During Game ---    
    function updateGameTimerDisplay() {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        displays.gameTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    function displayNextWord() {
        if (currentWordIndex < wordList.length) {
            displays.word.textContent = wordList[currentWordIndex];
            actionTakenForCurrentWord = false; // Reset action flag for the new word
            currentWordIndex++; // Increment to get the NEXT word next time
        } else {
            displays.word.textContent = "Alle Wörter gespielt!";
            if (timeLeft > 0) { // If time still left but words ran out
                stopDeviceMotionListener(); // No more words to guess
            }
        }
    }
    
    function flashScreenFeedback(type) {
        const gameScreenEl = screens.game;
        if (!gameScreenEl) return;
        const className = type === 'correct' ? 'screen-flash-correct' : 'screen-flash-skip';
        // Remove class first to ensure animation restarts if triggered quickly
        gameScreenEl.classList.remove('screen-flash-correct', 'screen-flash-skip');
        // Force reflow/repaint before adding class again for animation restart
        void gameScreenEl.offsetWidth;
        gameScreenEl.classList.add(className);
        // CSS animation will handle removal or duration, or use JS timeout if preferred:
        // setTimeout(() => gameScreenEl.classList.remove(className), 300); // Match animation duration
        // Make sure your CSS animation for these classes is around 0.3s to 0.5s
    }

    function startDeviceMotionListener() {
        if (!motionPermissionGranted) {
            console.warn("Keine Berechtigung für Bewegungssensoren.");
            // Maybe show an error on game screen?
            return;
        }
        // Remove existing listener before adding a new one, if any
        if (currentDeviceOrientationListener) {
            stopDeviceMotionListener(); 
        }
        lastBetaForDebounce = 0; // Reset lastBeta for new listening session

        // Using DeviceOrientationEvent for beta angle
        if (window.DeviceOrientationEvent) {
            currentDeviceOrientationListener = (event) => {
                if (event.beta === null) return; // Some devices might send null beta initially
                
                // Debounce based on significant change in beta
                if (Math.abs(event.beta - lastBetaForDebounce) > 5) { 
                    handleTilt(event);
                    lastBetaForDebounce = event.beta;
                } else if (lastBetaForDebounce === 0 && event.beta !== 0) { // Handle initial event if beta is not 0
                    handleTilt(event);
                    lastBetaForDebounce = event.beta;
                }
            };
            window.addEventListener('deviceorientation', currentDeviceOrientationListener, true);
            console.log("Device motion listener started.");
        } else {
            displays.word.textContent = "Sensor nicht unterstützt!";
            console.error("DeviceOrientationEvent nicht unterstützt.");
        }
    }

    function stopDeviceMotionListener() {
        if (currentDeviceOrientationListener) {
            window.removeEventListener('deviceorientation', currentDeviceOrientationListener, true);
            currentDeviceOrientationListener = null; // Clear the stored listener
            console.log("Device motion listener stopped.");
        }
    }

    function handleTilt(event) {
        if (!motionPermissionGranted || !screens.game.classList.contains('active') || isActionOnCooldown) {
            return;
        }

        const beta = event.beta; // Front-to-back tilt
        // Optional: Add gamma handling if needed for side-to-side, though beta is typical for this gesture

        // Check if tilt is outside the neutral zone before considering action
        if (beta > NEUTRAL_ZONE_BUFFER || beta < -NEUTRAL_ZONE_BUFFER) {
            if (!actionTakenForCurrentWord) {
                if (beta > TILT_THRESHOLD_DOWN) {
                    // Tilt down (forward) - Correct
                    actionTakenForCurrentWord = true;
                    isActionOnCooldown = true;
                    score++;
                    correctWords.push(wordList[currentWordIndex]); // Use currentWordIndex before it's incremented by displayNextWord
                    try { audio.correct.play(); } catch(e) { console.warn("Audio play failed for correct sound:", e); }
                    flashScreenFeedback('correct');
                    setTimeout(() => {
                        actionTakenForCurrentWord = false; // Reset before next word and cooldown end
                        displayNextWord();
                        isActionOnCooldown = false;
                    }, ACTION_COOLDOWN_MS); 
                } else if (beta < TILT_THRESHOLD_UP) {
                    // Tilt up (backward) - Skip
                    actionTakenForCurrentWord = true;
                    isActionOnCooldown = true;
                    try { audio.skip.play(); } catch(e) { console.warn("Audio play failed for skip sound:", e); }
                    flashScreenFeedback('skip');
                    setTimeout(() => {
                        actionTakenForCurrentWord = false; // Reset before next word and cooldown end
                        displayNextWord();
                        isActionOnCooldown = false;
                    }, ACTION_COOLDOWN_MS);
                }
            }
        } else {
            // Device is relatively flat, reset flag IF NOT IN COOLDOWN. 
            // If in cooldown, actionTakenForCurrentWord will be reset by the setTimeout.
            if (!isActionOnCooldown) {
                 actionTakenForCurrentWord = false;
            }
        }
    }

    function endGame() {
        stopDeviceMotionListener();
        if (wakeLock) {
            wakeLock.release().then(() => {
                wakeLock = null;
                console.log('Screen Wake Lock released.');
            }).catch(err => console.error('Error releasing Wake Lock:', err));
        }
        // Attempt to unlock screen orientation
        if (screen.orientation && typeof screen.orientation.unlock === 'function') {
            try {
                 screen.orientation.unlock();
                 console.log('Screen orientation unlocked.');
            } catch (err) {
                console.warn('Screen orientation unlock failed:', err.message);
            }
        }

        clearInterval(timerInterval);
        timerInterval = null;
        try { audio.timesup.play(); } catch(e) { console.warn("Audio play failed", e); }
        
        displays.finalScore.textContent = score;
        displays.correctWordsList.innerHTML = ''; // Clear previous list
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
        showScreen('summary');
    }

    buttons.playAgain.addEventListener('click', () => {
        // Re-shuffle words for the same category
        wordList = shuffleArray([...GAME_DATA.kategorien[currentCategory] || GAME_DATA["Alle Begriffe"]]);
        startInitialCountdown();
    });
    buttons.changeCategory.addEventListener('click', () => {
        showScreen('start');
    });

    // Initialize
    populateCategories();
    // Hide permission button if not on iOS or not https
    if (typeof DeviceMotionEvent === 'undefined' || typeof DeviceMotionEvent.requestPermission !== 'function') {
        buttons.requestPermission.style.display = 'none';
        document.querySelector('.permission-request-info').style.display = 'none';
        motionPermissionGranted = true; // Assume granted for non-iOS or HTTP
    } else if (window.location.protocol !== 'https:') {
        // DeviceMotionEvent.requestPermission typically requires HTTPS
        document.querySelector('.permission-request-info').textContent = "Für Bewegungssensoren ist eine sichere Verbindung (HTTPS) erforderlich.";
        buttons.requestPermission.disabled = true;
    }

    showScreen('start');
});

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(error => {
                console.log('ServiceWorker registration failed: ', error);
            });
    });
}