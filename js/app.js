document.addEventListener('DOMContentLoaded', () => {
    const screens = {
        start: document.getElementById('start-screen'),
        permission: document.getElementById('permission-screen'),
        categorySelection: document.getElementById('category-selection-screen'),
        timerSelection: document.getElementById('timer-selection-screen'),
        countdown: document.getElementById('countdown-screen'),
        game: document.getElementById('game-screen'),
        summary: document.getElementById('summary-screen'),
    };

    const buttons = {
        requestPermission: document.getElementById('request-permission-btn'),
        startSetup: document.getElementById('start-setup-btn'),
        categoryContainer: document.getElementById('category-buttons-container'), 
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
    let gameDuration = 60; 
    let wordList = [];
    let currentWordIndex = 0;
    let score = 0;
    let correctWords = [];
    let timerInterval = null; 
    let timeLeft = 0;
    let wakeLock = null;
    let motionPermissionGranted = false;
    let currentDeviceOrientationListener = null;
    
    let tiltState; 
    const TILT_THRESHOLD_DOWN = 75; 
    const TILT_THRESHOLD_UP = -75;  
    const NEUTRAL_ZONE_BUFFER = 20; 
    const HARDWARE_COOLDOWN_MS = 250; 

    function showScreen(screenName) {
        Object.values(screens).forEach(screen => screen.classList.remove('active'));
        screens[screenName].classList.add('active');

        if (screenName === 'start' || screenName === 'categorySelection' || screenName === 'timerSelection') {
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

    function populateCategories() {
        buttons.categoryContainer.innerHTML = ''; 
        const allWordsCategory = []; 
        for (const categoryKey in GAME_DATA.kategorien) {
            allWordsCategory.push(...GAME_DATA.kategorien[categoryKey]); 
            const btn = document.createElement('button');
            btn.classList.add('btn', 'category-btn');
            btn.textContent = categoryKey; 
            btn.addEventListener('click', () => selectCategory(categoryKey));
            buttons.categoryContainer.appendChild(btn);
        }
        GAME_DATA["Alle Begriffe"] = shuffleArray([...new Set(allWordsCategory)]); 

        const btnAll = document.createElement('button');
        btnAll.classList.add('btn', 'category-btn', 'random-all-btn'); 
        btnAll.id = 'random-all-btn'; 
        btnAll.textContent = "Alle Begriffe (Zufall)";
        btnAll.addEventListener('click', () => selectCategory("Alle Begriffe"));
        buttons.categoryContainer.appendChild(btnAll); 
    }
    
    function selectCategory(categoryName) {
        if (!motionPermissionGranted && needsMotionPermission()) { 
            alert("Bitte erlaube zuerst den Zugriff auf die Bewegungssensoren.");
            showScreen('permission');
            return;
        }
        currentCategory = categoryName;
        displays.selectedCategoryName.textContent = categoryName; 

        let wordsForCategory = GAME_DATA.kategorien[categoryName] || GAME_DATA[categoryName]; 
        
        if (!wordsForCategory || wordsForCategory.length === 0) {
            console.warn(`Kategorie "${categoryName}" ist leer oder nicht gefunden.`);
            if (GAME_DATA["Alle Begriffe"] && GAME_DATA["Alle Begriffe"].length > 0) {
                console.warn(`Fallback zur Kategorie "Alle Begriffe".`);
                currentCategory = "Alle Begriffe";
                displays.selectedCategoryName.textContent = currentCategory;
                wordsForCategory = GAME_DATA["Alle Begriffe"];
            } else {
                alert(`Die Kategorie "${categoryName}" (und auch "Alle Begriffe") enthält keine Wörter. Bitte überprüfe gameData.js.`);
                showScreen('categorySelection'); 
                return;
            }
        }

        wordList = shuffleArray([...wordsForCategory]);
        currentWordIndex = 0;
        score = 0;
        correctWords = [];

        if (screen.orientation && typeof screen.orientation.unlock === 'function') {
            try {
                screen.orientation.unlock();
                console.log(`Screen orientation unlocked for timer selection.`);
            } catch (err) {
                console.warn(`Screen orientation unlock failed for timer selection:`, err.message);
            }
        }
        showScreen('timerSelection');
    }

    function selectGameDuration(duration) {
        gameDuration = parseInt(duration, 10);
        console.log(`Game duration set to: ${gameDuration}s`);
        document.querySelectorAll('.timer-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.time === duration);
        });
        startInitialCountdown();
    }
    
    document.querySelectorAll('.timer-btn').forEach(button => {
         button.addEventListener('click', (e) => selectGameDuration(e.target.dataset.time));
    });

    function startInitialCountdown() {
        showScreen('countdown');
        let countdown = 3;
        displays.countdownTimer.textContent = countdown;
        try { 
            audio.countdown.currentTime = 0;
            audio.countdown.play(); 
        } catch(e) { console.warn("Audio play failed for initial countdown sound:", e); }
        
        if(timerInterval) clearInterval(timerInterval);

        timerInterval = setInterval(() => {
            countdown--;
            displays.countdownTimer.textContent = countdown;
            if (countdown > 0) {
                try { 
                    audio.countdown.currentTime = 0;
                    audio.countdown.play(); 
                } catch(e) { console.warn("Audio play failed for countdown interval sound:", e); }
            } else {
                clearInterval(timerInterval);
                timerInterval = null; 
                console.log("Countdown finished, starting game.");
                startGame();
            }
        }, 1000);
    }

    async function startGame() {
        if (!motionPermissionGranted && needsMotionPermission()) {
            alert("Bitte erlaube zuerst den Zugriff auf die Bewegungssensoren.");
            showScreen('permission'); 
            return;
        }
        
        tiltState = 'WAITING_FOR_TILT'; 
        console.log("Tilt state initialized to WAITING_FOR_TILT");

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
        displayNextWord(); 

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
    
    function updateGameTimerDisplay() {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        displays.gameTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    function displayNextWord() {
        console.log(`displayNextWord called. Index: ${currentWordIndex}, Wordlist length: ${wordList.length}`);
        if (currentWordIndex < wordList.length) {
            const word = wordList[currentWordIndex];
            console.log(`Displaying word: ${word}`);
            displays.word.textContent = word;
        } else {
            displays.word.textContent = "Alle Wörter gespielt!";
            console.log("All words played.");
            if (timeLeft > 0) { 
                stopDeviceMotionListener(); 
            }
        }
    }
    
    function flashScreenFeedback(type) {
        const gameScreenEl = screens.game;
        if (!gameScreenEl) return;
        const className = type === 'correct' ? 'screen-flash-correct' : 'screen-flash-skip';
        gameScreenEl.classList.remove('screen-flash-correct', 'screen-flash-skip');
        void gameScreenEl.offsetWidth; 
        gameScreenEl.classList.add(className);
    }

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
            console.log("Device motion listener started. Raw events passed to handleTilt.");
        } else {
            displays.word.textContent = "Sensor nicht unterstützt!";
            console.error("DeviceOrientationEvent nicht unterstützt.");
        }
    }

    function stopDeviceMotionListener() {
        if (currentDeviceOrientationListener) {
            window.removeEventListener('deviceorientation', currentDeviceOrientationListener, true);
            currentDeviceOrientationListener = null; 
            console.log("Device motion listener stopped.");
        }
    }

    function handleTilt(event) {
        const beta = event.beta;

        switch (tiltState) {
            case 'WAITING_FOR_TILT':
                if (currentWordIndex >= wordList.length) break; 

                if (beta > TILT_THRESHOLD_DOWN) {
                    console.log(`WAITING_FOR_TILT: Tilt DOWN for: ${wordList[currentWordIndex]}`);
                    score++;
                    correctWords.push(wordList[currentWordIndex]);
                    try { audio.correct.currentTime = 0; audio.correct.play(); } catch(e) { console.warn("Audio play failed for correct sound:", e); }
                    flashScreenFeedback('correct');
                    
                    tiltState = 'ACTION_TAKEN_COOLDOWN';
                    console.log(`Transitioning to ACTION_TAKEN_COOLDOWN (Correct)`);

                    setTimeout(() => {
                        currentWordIndex++; 
                        displayNextWord(); 
                        tiltState = 'WAITING_FOR_NEUTRAL_RETURN';
                        console.log(`ACTION_TAKEN_COOLDOWN (Correct) finished. Displayed next word. Transitioning to WAITING_FOR_NEUTRAL_RETURN.`);
                    }, HARDWARE_COOLDOWN_MS);

                } else if (beta < TILT_THRESHOLD_UP) {
                    console.log(`WAITING_FOR_TILT: Tilt UP for: ${wordList[currentWordIndex]}`);
                    try { audio.skip.currentTime = 0; audio.skip.play(); } catch(e) { console.warn("Audio play failed for skip sound:", e); }
                    flashScreenFeedback('skip');

                    tiltState = 'ACTION_TAKEN_COOLDOWN';
                    console.log(`Transitioning to ACTION_TAKEN_COOLDOWN (Skip)`);

                    setTimeout(() => {
                        currentWordIndex++; 
                        displayNextWord();
                        tiltState = 'WAITING_FOR_NEUTRAL_RETURN';
                        console.log(`ACTION_TAKEN_COOLDOWN (Skip) finished. Displayed next word. Transitioning to WAITING_FOR_NEUTRAL_RETURN.`);
                    }, HARDWARE_COOLDOWN_MS);
                }
                break;

            case 'ACTION_TAKEN_COOLDOWN':
                break;

            case 'WAITING_FOR_NEUTRAL_RETURN':
                if (Math.abs(beta) < NEUTRAL_ZONE_BUFFER) { 
                    console.log(`WAITING_FOR_NEUTRAL_RETURN: Phone returned to neutral. Transitioning to WAITING_FOR_TILT.`);
                    tiltState = 'WAITING_FOR_TILT';
                }
                break;
        }
    }

    function endGame() {
        console.log("endGame function called.");
        stopDeviceMotionListener();
        releaseWakeLock();

        if (screen.orientation && typeof screen.orientation.unlock === 'function') {
            try {
                 screen.orientation.unlock();
                 console.log('Screen orientation unlocked after game.');
            } catch (err) {
                console.warn('Screen orientation unlock failed after game:', err.message);
            }
        }

        clearInterval(timerInterval);
        timerInterval = null;
        try { audio.timesup.currentTime = 0; audio.timesup.play(); } catch(e) { console.warn("Audio play failed for timesup sound", e); }
        
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

    buttons.playAgain.addEventListener('click', () => {
        showScreen('categorySelection'); 
    });

    buttons.changeCategory.addEventListener('click', () => {
        showScreen('categorySelection');
    });

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

    function releaseWakeLock() {
        if (wakeLock !== null && !wakeLock.released) {
            wakeLock.release().then(() => {
                wakeLock = null;
                console.log('Screen Wake Lock released programmatically.');
            }).catch(err => console.error('Error releasing Wake Lock:', err));
        }
    }
    
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    function needsMotionPermission() {
        return typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function';
    }

    function initializeApp() {
        if (needsMotionPermission()) {
            buttons.requestPermission.style.display = 'inline-block';
            document.querySelector('.permission-request-info').style.display = 'block';
            buttons.startSetup.style.display = 'none';

            buttons.requestPermission.addEventListener('click', async () => {
                try {
                    const permissionState = await DeviceMotionEvent.requestPermission();
                    if (permissionState === 'granted') {
                        motionPermissionGranted = true;
                        console.log("Device motion permission granted.");
                        showScreen('start'); 
                        buttons.requestPermission.style.display = 'none';
                        document.querySelector('.permission-request-info').style.display = 'none';
                        buttons.startSetup.style.display = 'inline-block';
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
            motionPermissionGranted = true;
            console.log("Device motion permission not required or already handled.");
            buttons.requestPermission.style.display = 'none';
            document.querySelector('.permission-request-info').style.display = 'none';
            buttons.startSetup.style.display = 'inline-block';
        }
        
        buttons.startSetup.addEventListener('click', () => {
            if (!motionPermissionGranted && needsMotionPermission()) {
                showScreen('permission');
            } else {
                showScreen('categorySelection');
            }
        });

        populateCategories();
        if (needsMotionPermission() && !motionPermissionGranted) {
            showScreen('permission');
        } else {
            showScreen('start');
        }
    }
    
    initializeApp();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js') 
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(error => {
                console.log('ServiceWorker registration failed: ', error);
            });
    });
}