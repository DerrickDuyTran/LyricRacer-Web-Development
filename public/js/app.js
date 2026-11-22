let lyrics = [];
let lyricParagraphs = [];
let seconds = 0;
let timerId;
let currentIndex = -1;
let currentText = "";
let audioPlayer;
let totalTyped = 0;
let correctLetters = 0;
let streak = 0;
let score = 0;
let typingSeconds = 0;
let typingTimerId;
let finalScore = 0;
let track = "";
let scoreSaved = false;
let socket;
let lastSent = 0;
let joined = false;
const playbackSpeeds = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
let playbackSpeedIndex = 3;

function updateScoreDisplay() {
  let accuracy = 0;
  let wpm = 0;
  finalScore = 0;

  if (totalTyped > 0) {
    accuracy = Math.round(correctLetters / totalTyped * 100);
  }

  if (typingSeconds > 0) {
    let minutesTyped = typingSeconds / 60;
    wpm = Math.round(correctLetters / 5 / minutesTyped);
    finalScore = Math.round(score * (wpm / 10) * (accuracy / 100) * playbackSpeeds[playbackSpeedIndex]);
  }

  document.getElementById("wpm").textContent = wpm;
  document.getElementById("accuracy").textContent = accuracy + "%";
  document.getElementById("streak").textContent = streak;
  document.getElementById("score").textContent = finalScore;
  sendProgress(wpm, accuracy, finalScore);
}

function resetScore() {
  totalTyped = 0;
  correctLetters = 0;
  streak = 0;
  score = 0;
  clearInterval(typingTimerId);
  typingTimerId = undefined;
  typingSeconds = 0;
  scoreSaved = false;
  updateScoreDisplay();
}

function saveScore() {
  if (scoreSaved) {
    return;
  }

  scoreSaved = true;

  fetch("/api/scores", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      songTitle: track,
      score: finalScore
    })
  }).then(response => {
    return response.json().then(data => {
      if (response.status === 200) {
        document.getElementById("message").textContent = "Score saved";
      } else {
        scoreSaved = false;
        document.getElementById("message").textContent = data.error;
      }
    });
  }).catch(error => {
    scoreSaved = false;
    document.getElementById("message").textContent = "Could not save score";
  });
}

function trackTyping(typed) {
  if (typingTimerId === undefined && typed.length > 0) {
    typingTimerId = setInterval(() => {
      typingSeconds++;
      updateScoreDisplay();
    }, 1000);
  }

  let correctTyped = typed.substring(0, typed.length - 1);
  let newLetter = typed[typed.length - 1];
  totalTyped++;

  if (newLetter === currentText[correctTyped.length]) {
    correctLetters++;
    streak++;
    score += 10;
    correctTyped += newLetter;
  } else {
    streak = 0;
    score -= 5;
  }

  updateScoreDisplay();
  return correctTyped;
}

function renderTyping() {
  let typed = document.getElementById("typing-input").value;
  let display = document.getElementById("current-lyric");
  display.textContent = "";

  if (currentText === "") {
    display.textContent = "Waiting for lyrics...";
    return;
  }

  for (let i = 0; i < currentText.length; i++) {
    let span = document.createElement("span");
    span.textContent = currentText[i];

    if (i < typed.length) {
      span.className = typed[i] === currentText[i] ? "correct" : "incorrect";
    }

    display.append(span);
  }
}

function showCurrentLyric(text) {
  currentText = text;
  document.getElementById("typing-input").value = "";
  renderTyping();
}

function formatTime(time) {
  let minutes = Math.floor(time / 60);
  let seconds = Math.floor(time % 60);

  if (seconds < 10) {
    seconds = "0" + seconds;
  }

  return minutes + ":" + seconds;
}

function parseLyrics(syncedLyrics) {
  let lyrics = [];
  let lines = syncedLyrics.split("\n");

  for (let line of lines) {
    let closingBracketIndex = line.indexOf("]");

    if (closingBracketIndex !== -1) {
      let timestamp = line.substring(1, closingBracketIndex);
      let lyric = line.substring(closingBracketIndex + 1).trim();
      let timeParts = timestamp.split(":");

      let minutes = Number(timeParts[0]);
      let seconds = Number(timeParts[1]);

      if (lyric !== "") {
        lyrics.push({time: minutes * 60 + seconds, text: lyric});
      }
    }
  }

  return lyrics;
}

function displayLyrics(song) {
  lyrics = parseLyrics(song.syncedLyrics);
  lyricParagraphs = [];
  resetScore();

  lockPlaybackSpeed();

  document.getElementById("lyrics").textContent = "";

  for (let lyric of lyrics) {
    let paragraph = document.createElement("p");
    paragraph.textContent = formatTime(lyric.time) + " - " + lyric.text;
    document.getElementById("lyrics").append(paragraph);
    lyricParagraphs.push(paragraph);
  }

  document.getElementById("lyrics-section").hidden = false;
  document.getElementById("typing-input").focus();
  startTimer();
}

function updateLyrics() {
  if (!audioPlayer || typeof audioPlayer.getCurrentTime !== "function") {
    return;
  }
  seconds = audioPlayer.getCurrentTime();

  document.getElementById("timer").textContent = formatTime(seconds);
  updateScoreDisplay();

  let nextIndex = currentIndex + 1;

  if (nextIndex < lyrics.length && lyrics[nextIndex].time <= seconds) {
    if (currentIndex >= 0) {
      lyricParagraphs[currentIndex].classList.remove("active");
    }
    currentIndex = nextIndex;
    showCurrentLyric(lyrics[currentIndex].text);
    lyricParagraphs[currentIndex].classList.add("active");
  }
}

function startTimer() {
  clearInterval(timerId);
  seconds = 0;
  currentIndex = -1;
  currentText = "";
  document.getElementById("typing-input").value = "";
  document.getElementById("typing-input").disabled = false;
  document.getElementById("current-lyric").textContent = "Waiting for lyrics...";
}

function loadSong(songTitle, artist) {
  if (songTitle.trim() === "") {
    document.getElementById("message").textContent = "Enter a song title";
    return;
  }

  track = songTitle;
  let params = new URLSearchParams({track: songTitle, artist: artist});

  fetch("/api/lyrics?" + params.toString()).then(response => {
    return response.json().then(data => {
      if (response.status === 200) {
        document.getElementById("message").textContent = "Lyrics loaded";
        loadYouTubeVideo(track, artist);
        displayLyrics(data);
      } else {
        clearInterval(timerId);
        document.getElementById("message").textContent = data.error;
        document.getElementById("lyrics-section").hidden = true;
      }
    });
  }).catch(error => {
    clearInterval(timerId);
    document.getElementById("message").textContent = "Could not load lyrics";
  });
}

document.getElementById("search").addEventListener("click", () => {
  let track = document.getElementById("track").value;
  let artist = document.getElementById("artist").value;
  loadSong(track, artist);
});

function checkLoginStatus() {
  fetch("/api/me").then(response => response.json()).then(data => {
      let account = document.getElementById("account");
      account.textContent = "";

      if (data.loggedIn) {
        document.getElementById("player-name").value = data.user.name;
        let username = document.createElement("span");
        username.textContent = data.user.name;
        let logout = document.createElement("button");
        logout.textContent = "Sign Out";
        logout.addEventListener("click", () => {
          window.location.href = "/logout";
        });
        account.append(username, logout);
      } else {
        let signIn = document.createElement("button");
        signIn.id = "google-sign-in";
        signIn.textContent = "Sign in with Google";
        signIn.addEventListener("click", () => {
          window.location.href = "/auth/google";
        });
        account.append(signIn);
      }
    })
    .catch(error => {
      console.error("Could not check login status:", error);
    });
}

function loadYouTubeVideo(track, artist) {
  let params = new URLSearchParams({track: track, artist: artist});

  fetch("/api/youtube?" + params.toString())
    .then(response => {
      return response.json().then(data => {
        if (!response.ok) {
          throw new Error(data.error);
        }
        if (audioPlayer) {
          audioPlayer.destroy();
        }
        audioPlayer = new YT.Player("audio-player", {
        videoId: data.audioVideoId,
        playerVars: {
          autoplay: 1,
        },
        events: {
          onReady: () => {
            audioPlayer.setPlaybackRate(playbackSpeeds[playbackSpeedIndex]);
            audioPlayer.playVideo();
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.PLAYING) {
              clearInterval(timerId);
              updateLyrics();
              timerId = setInterval(() => {
                updateLyrics();
              }, 100);
            }
            if (event.data === YT.PlayerState.ENDED) {
              clearInterval(timerId);
              clearInterval(typingTimerId);
              typingTimerId = undefined;
              typingInput.disabled = true;
              updateScoreDisplay();
              saveScore();
              sendFinish();
            }
          }
        }
      });
    });
  }).catch(error => {
    console.error("Could not load YouTube videos:", error);
    document.getElementById("video-container").textContent = "Could not find videos.";
  });
}

function lockPlaybackSpeed() {
  document.getElementById("speed-down").disabled = true;
  document.getElementById("speed-up").disabled = true;
}

function updatePlaybackSpeed() {
  let speed = playbackSpeeds[playbackSpeedIndex];

  document.getElementById("playback-speed").textContent = speed + "x";

  if (audioPlayer && typeof audioPlayer.setPlaybackRate === "function") {
    audioPlayer.setPlaybackRate(speed);
  }
}

document.getElementById("speed-down").addEventListener("click", () => {
  if (playbackSpeedIndex > 0) {
    playbackSpeedIndex--;
    updatePlaybackSpeed();
  }
});

document.getElementById("speed-up").addEventListener("click", () => {
  if (playbackSpeedIndex < playbackSpeeds.length - 1) {
    playbackSpeedIndex++;
    updatePlaybackSpeed();
  }
});

function renderRoom(room) {
  let isHost = room.you === 0;
  let info = "Room code: " + room.code + " (" + room.players.length + "/4 players)";

  if (room.status === "finished") {
    info += " - Race finished!";
  } else if (room.status === "lobby" && isHost) {
    info += " - Enter a song above, then click Start Game.";
  } else if (room.status === "lobby") {
    info += " - Waiting for the host to start...";
  }

  document.getElementById("room-info").textContent = info;
  document.getElementById("join-form").hidden = true;
  document.getElementById("search").disabled = true;
  document.getElementById("start-game").hidden = !(isHost && room.status !== "playing");

  let lanes = document.getElementById("lanes");
  lanes.textContent = "";

  for (let i = 0; i < 4; i++) {
    let player = room.players[i];
    let lane = document.createElement("div");
    let label = document.createElement("div");
    let name = document.createElement("span");
    let stats = document.createElement("span");
    let track = document.createElement("div");
    let bar = document.createElement("div");

    lane.className = "lane";
    label.className = "lane-label";
    track.className = "lane-track";
    bar.className = "lane-bar";

    if (player) {
      name.textContent = "Player " + (i + 1) + ": " + player.name;
      stats.textContent = player.wpm + " WPM  " + player.accuracy + "%  " + player.score + " pts";
      bar.style.width = player.progress * 100 + "%";

      if (i === room.you) {
        name.textContent += " (you)";
        lane.classList.add("you");
      }
      if (player.finished) {
        stats.textContent += "  Done";
      }
    } else {
      name.textContent = "Player " + (i + 1) + ": waiting...";
      lane.classList.add("empty");
    }
    label.append(name, stats);
    track.append(bar);
    lane.append(label, track);
    lanes.append(lane);
  }
}

function connect() {
  if (socket) {
    return;
  }

  let protocol = "ws://";
  if (location.protocol === "https:") {
    protocol = "wss://";
  }
  socket = new WebSocket(protocol + location.host);
  socket.addEventListener("open", () => {
    let name = document.getElementById("player-name").value.trim();
    if (name === "") {
      name = "Guest";
    }
    socket.send(JSON.stringify({
      type: "join",
      name: name,
      code: document.getElementById("room-code").value
    }));
  });

  socket.addEventListener("message", event => {
    let msg = JSON.parse(event.data);

    if (msg.type === "room") {
      joined = true;
      renderRoom(msg);
    } else if (msg.type === "start") {
      document.getElementById("track").value = msg.track;
      document.getElementById("artist").value = msg.artist;
      loadSong(msg.track, msg.artist);
    } else if (msg.type === "error") {
      document.getElementById("room-info").textContent = msg.error;

      if (!joined) {
        socket.close();
      }
    }
  });

  socket.addEventListener("close", () => {
    socket = undefined;
    joined = false;
    document.getElementById("join-form").hidden = false;
    document.getElementById("start-game").hidden = true;
    document.getElementById("search").disabled = false;
  });

  socket.addEventListener("error", () => {
    document.getElementById("room-info").textContent = "Could not connect to the server";
  });
}

function sendProgress(wpm, accuracy, finalScore) {
  let now = Date.now();

  if (!socket || socket.readyState !== WebSocket.OPEN || lyrics.length === 0) {
    return;
  }
  if (now - lastSent < 500) {
    return;
  }

  lastSent = now;
  socket.send(JSON.stringify({
    type: "progress",
    progress: (currentIndex + 1) / lyrics.length,
    wpm: wpm,
    accuracy: accuracy,
    score: finalScore
  }));
}

function sendFinish() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({type: "finish"}));
  }
}

document.getElementById("join").addEventListener("click", connect);
document.getElementById("start-game").addEventListener("click", () => {
  if (document.getElementById("track").value.trim() === "") {
    document.getElementById("room-info").textContent = "Enter a song title in Find a song, then click Start game.";
    return;
  }
  socket.send(JSON.stringify({
    type: "start",
    track: document.getElementById("track").value,
    artist: document.getElementById("artist").value
  }));
});

checkLoginStatus();
let typingInput = document.getElementById("typing-input");

typingInput.addEventListener("beforeinput", event => {
  if (event.inputType !== "insertText") {
    event.preventDefault();
  }
});

typingInput.addEventListener("input", () => {
  let typed = trackTyping(typingInput.value);
  typingInput.value = typed;
  renderTyping();
});

function updateButtons() {
  let hasTitle = document.getElementById("track").value.trim() !== "";
  document.getElementById("start-game").disabled = !hasTitle;

  if (!socket) {
    document.getElementById("search").disabled = !hasTitle;
  }
}
document.getElementById("track").addEventListener("input", updateButtons);
updateButtons();

const tag = document.createElement("script");
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);
