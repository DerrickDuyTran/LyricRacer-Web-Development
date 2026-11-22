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
let songEnded = false;
let socket;
let lastSent = 0;
let joined = false;
const playbackSpeeds = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
let playbackSpeedIndex = 3;

function showView(name) {
  let views = ["home", "lobby", "race"];

  for (let view of views) {
    document.getElementById(view + "-view").hidden = view !== name;
  }
}

function openDialog(id) {
  let dialog = document.getElementById(id);

  if (!dialog.open) {
    dialog.showModal();
  }
}

function closeDialogs() {
  for (let dialog of document.querySelectorAll("dialog")) {
    dialog.close();
  }
}

function openSongDialog() {
  document.getElementById("message").textContent = "";

  if (joined) {
    document.getElementById("search-heading").textContent = "Pick the race song";
    document.getElementById("search").textContent = "Start race";
  } else {
    document.getElementById("search-heading").textContent = "Find a song";
    document.getElementById("search").textContent = "Search lyrics";
  }

  openDialog("song-dialog");
  document.getElementById("track").focus();
}

function openJoinDialog() {
  document.getElementById("join-message").textContent = "";
  openDialog("join-dialog");
  document.getElementById("player-name").focus();
}

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
        document.getElementById("results-message").textContent = "Score saved";
      } else {
        scoreSaved = false;
        document.getElementById("results-message").textContent = data.error;
      }
    });
  }).catch(error => {
    scoreSaved = false;
    document.getElementById("results-message").textContent = "Could not save score";
  });
}

function showResults() {
  document.getElementById("result-wpm").textContent = document.getElementById("wpm").textContent;
  document.getElementById("result-accuracy").textContent = document.getElementById("accuracy").textContent;
  document.getElementById("result-score").textContent = document.getElementById("score").textContent;
  document.getElementById("results-message").textContent = "";

  if (joined) {
    document.getElementById("results-next").textContent = "Back to lobby";
  } else {
    document.getElementById("results-next").textContent = "Choose another song";
  }

  openDialog("results-dialog");
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
  songEnded = false;
  resetScore();

  lockPlaybackSpeed();

  document.getElementById("lyrics").textContent = "";

  for (let lyric of lyrics) {
    let paragraph = document.createElement("p");
    paragraph.textContent = formatTime(lyric.time) + " - " + lyric.text;
    document.getElementById("lyrics").append(paragraph);
    lyricParagraphs.push(paragraph);
  }

  closeDialogs();
  showView("race");
  updateLeaveButton();
  document.getElementById("race-message").textContent = "Loading song audio...";
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
  document.getElementById("timer").textContent = "0:00";
  document.getElementById("typing-input").value = "";
  document.getElementById("typing-input").disabled = false;
  document.getElementById("current-lyric").textContent = "Waiting for lyrics...";
}

function stopSong() {
  clearInterval(timerId);
  clearInterval(typingTimerId);
  typingTimerId = undefined;
  destroyAudioPlayer();
  lyrics = [];
  lyricParagraphs = [];
  currentIndex = -1;
  currentText = "";
  unlockPlaybackSpeed();
}

function loadSong(songTitle, artist, messageId) {
  let message = document.getElementById(messageId);

  if (songTitle.trim() === "") {
    message.textContent = "Enter a song title";
    return;
  }

  track = songTitle;
  message.textContent = "Loading lyrics...";
  let params = new URLSearchParams({track: songTitle, artist: artist});

  fetch("/api/lyrics?" + params.toString()).then(response => {
    return response.json().then(data => {
      if (response.status === 200) {
        message.textContent = "";
        loadYouTubeVideo(track, artist);
        displayLyrics(data);
      } else {
        clearInterval(timerId);
        message.textContent = data.error;
      }
    });
  }).catch(error => {
    clearInterval(timerId);
    message.textContent = "Could not load lyrics";
  });
}

function startRace(songTitle, artist) {
  let message = document.getElementById("message");
  let params = new URLSearchParams({track: songTitle, artist: artist});
  message.textContent = "Checking lyrics...";

  fetch("/api/lyrics?" + params.toString()).then(response => {
    return response.json().then(data => {
      if (response.status === 200) {
        message.textContent = "";
        socket.send(JSON.stringify({
          type: "start",
          track: songTitle,
          artist: artist
        }));
      } else {
        message.textContent = data.error;
      }
    });
  }).catch(error => {
    message.textContent = "Could not load lyrics";
  });
}

document.getElementById("search").addEventListener("click", () => {
  let track = document.getElementById("track").value;
  let artist = document.getElementById("artist").value;

  if (joined) {
    startRace(track, artist);
  } else {
    loadSong(track, artist, "message");
  }
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

function destroyAudioPlayer() {
  if (audioPlayer) {
    audioPlayer.destroy();
    audioPlayer = undefined;
  }

  if (!document.getElementById("audio-player")) {
    let player = document.createElement("div");
    player.id = "audio-player";
    document.getElementById("audio-container").append(player);
  }
}

function loadYouTubeVideo(track, artist) {
  let params = new URLSearchParams({track: track, artist: artist});

  fetch("/api/youtube?" + params.toString())
    .then(response => {
      return response.json().then(data => {
        if (!response.ok) {
          throw new Error(data.error);
        }
        destroyAudioPlayer();
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
              document.getElementById("race-message").textContent = "";
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
              songEnded = true;
              updateLeaveButton();
              updateScoreDisplay();
              showResults();
              saveScore();
              sendFinish();
            }
          }
        }
      });
    });
  }).catch(error => {
    console.error("Could not load YouTube videos:", error);
    document.getElementById("race-message").textContent = "Could not load the song audio.";
  });
}

function lockPlaybackSpeed() {
  for (let button of document.querySelectorAll(".speed-down, .speed-up")) {
    button.disabled = true;
  }
}

function unlockPlaybackSpeed() {
  for (let button of document.querySelectorAll(".speed-down, .speed-up")) {
    button.disabled = false;
  }
}

function updatePlaybackSpeed() {
  let speed = playbackSpeeds[playbackSpeedIndex];

  for (let label of document.querySelectorAll(".playback-speed")) {
    label.textContent = speed + "x";
  }

  if (audioPlayer && typeof audioPlayer.setPlaybackRate === "function") {
    audioPlayer.setPlaybackRate(speed);
  }
}

for (let button of document.querySelectorAll(".speed-down")) {
  button.addEventListener("click", () => {
    if (playbackSpeedIndex > 0) {
      playbackSpeedIndex--;
      updatePlaybackSpeed();
    }
  });
}

for (let button of document.querySelectorAll(".speed-up")) {
  button.addEventListener("click", () => {
    if (playbackSpeedIndex < playbackSpeeds.length - 1) {
      playbackSpeedIndex++;
      updatePlaybackSpeed();
    }
  });
}

function updateLeaveButton() {
  let button = document.getElementById("leave-race");

  if (!joined) {
    button.textContent = "Back to menu";
  } else if (songEnded) {
    button.textContent = "Back to lobby";
  } else {
    button.textContent = "Leave room";
  }
}

function renderLanes(containerId, room) {
  let lanes = document.getElementById(containerId);
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

function renderRoom(room) {
  let isHost = room.you === 0;
  let info = room.players.length + "/4 players";

  if (room.status === "finished") {
    info += " - Race finished!";
  } else if (room.status === "playing") {
    info += " - Race in progress";
  } else if (isHost) {
    info += " - Click Choose song and start when everyone is in.";
  } else {
    info += " - Waiting for the host to start...";
  }

  document.getElementById("lobby-code").textContent = room.code;
  document.getElementById("room-info").textContent = info;
  document.getElementById("start-game").hidden = !(isHost && room.status !== "playing");
  document.getElementById("race-room").hidden = false;

  renderLanes("lobby-lanes", room);
  renderLanes("race-lanes", room);
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
      if (!joined) {
        joined = true;
        closeDialogs();
        showView("lobby");
        document.getElementById("lobby-message").textContent = "";
      }
      renderRoom(msg);
    } else if (msg.type === "start") {
      document.getElementById("track").value = msg.track;
      document.getElementById("artist").value = msg.artist;
      loadSong(msg.track, msg.artist, "lobby-message");
    } else if (msg.type === "error") {
      if (joined) {
        document.getElementById("lobby-message").textContent = msg.error;
      } else {
        document.getElementById("join-message").textContent = msg.error;
        socket.close();
      }
    }
  });

  socket.addEventListener("close", () => {
    let wasJoined = joined;
    socket = undefined;
    joined = false;
    document.getElementById("race-room").hidden = true;

    if (wasJoined) {
      stopSong();
      closeDialogs();
      showView("home");
    }
  });

  socket.addEventListener("error", () => {
    document.getElementById("join-message").textContent = "Could not connect to the server";
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

document.getElementById("open-solo").addEventListener("click", openSongDialog);
document.getElementById("open-join").addEventListener("click", openJoinDialog);
document.getElementById("start-game").addEventListener("click", openSongDialog);
document.getElementById("join").addEventListener("click", connect);

document.getElementById("song-close").addEventListener("click", () => {
  document.getElementById("song-dialog").close();
});

document.getElementById("join-close").addEventListener("click", () => {
  document.getElementById("join-dialog").close();
});

document.getElementById("results-close").addEventListener("click", () => {
  document.getElementById("results-dialog").close();
});

document.getElementById("results-next").addEventListener("click", () => {
  stopSong();
  closeDialogs();

  if (joined) {
    showView("lobby");
  } else {
    showView("home");
    openSongDialog();
  }
});

document.getElementById("leave-room").addEventListener("click", () => {
  socket.close();
});

document.getElementById("leave-race").addEventListener("click", () => {
  if (!joined) {
    stopSong();
    showView("home");
  } else if (songEnded) {
    stopSong();
    showView("lobby");
  } else {
    socket.close();
  }
});

for (let id of ["track", "artist"]) {
  document.getElementById(id).addEventListener("keydown", event => {
    if (event.key === "Enter" && !document.getElementById("search").disabled) {
      document.getElementById("search").click();
    }
  });
}

for (let id of ["player-name", "room-code"]) {
  document.getElementById(id).addEventListener("keydown", event => {
    if (event.key === "Enter") {
      connect();
    }
  });
}

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
  document.getElementById("search").disabled = !hasTitle;
}
document.getElementById("track").addEventListener("input", updateButtons);
updateButtons();

const tag = document.createElement("script");
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);
