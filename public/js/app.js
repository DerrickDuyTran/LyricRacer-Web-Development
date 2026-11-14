let lyrics = [];
let lyricParagraphs = [];
let seconds = 0;
let timerId;
let currentIndex = -1;
let currentText = "";
let audioPlayer;
let videoPlayer;
let totalTyped = 0;
let correctLetters = 0;
let streak = 0;
let score = 0;
let typingSeconds = 0;
let typingTimerId;

function updateScoreDisplay() {
  let accuracy = 0;
  let wpm = 0;
  let finalScore = 0;

  if (totalTyped > 0) {
    accuracy = Math.round(correctLetters / totalTyped * 100);
  }

  if (typingSeconds > 0) {
    let minutesTyped = typingSeconds / 60;
    wpm = Math.round(correctLetters / 5 / minutesTyped);
    finalScore = Math.round(score * (wpm / 10));
  }

  document.getElementById("wpm").textContent = wpm;
  document.getElementById("accuracy").textContent = accuracy + "%";
  document.getElementById("streak").textContent = streak;
  document.getElementById("score").textContent = finalScore;
}

function resetScore() {
  totalTyped = 0;
  correctLetters = 0;
  streak = 0;
  score = 0;
  clearInterval(typingTimerId);
  typingTimerId = undefined;
  typingSeconds = 0;
  updateScoreDisplay();
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
  document.getElementById("current-lyric").textContent = "Waiting for lyrics...";
}

document.getElementById("search").addEventListener("click", () => {
  let track = document.getElementById("track").value;
  let artist = document.getElementById("artist").value
  loadYouTubeVideo(track, artist);

  fetch("/api/lyrics?track=" + track + "&artist=" + artist).then(response => {
    return response.json().then(data => {
      if (response.status === 200) {
        document.getElementById("message").textContent = "Lyrics loaded";
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
});

function checkLoginStatus() {
  fetch("/api/me").then(response => response.json()).then(data => {
      let account = document.getElementById("account");
      account.textContent = "";

      if (data.loggedIn) {
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
  let videoSection = document.getElementById("video-section");
  videoSection.hidden = false;

  fetch("/api/youtube?" + params.toString())
    .then(response => {
      return response.json().then(data => {
        if (!response.ok) {
          throw new Error(data.error);
        }
        if (audioPlayer) {
          audioPlayer.destroy();
        }
        if (videoPlayer) {
          videoPlayer.destroy();
        }
        audioPlayer = new YT.Player("audio-player", {
        videoId: data.audioVideoId,
        playerVars: {
          autoplay: 1,
        },
        events: {
          onReady: () => {
            audioPlayer.playVideo();
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.PLAYING) {
              videoPlayer.playVideo();
              clearInterval(timerId);
              updateLyrics();
              timerId = setInterval(() => {
                updateLyrics();
              }, 100);
            }
            if (event.data === YT.PlayerState.ENDED) {
              videoPlayer.stopVideo();
              clearInterval(timerId);
            }
          }
        }
      });
      videoPlayer = new YT.Player("music-video-player", {
      videoId: data.musicVideoId,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
      },
        events: {
        onReady: () => {
        videoPlayer.mute();
      }
    }
  });
  });
  }).catch(error => {
    console.error("Could not load YouTube videos:", error);
    document.getElementById("video-container").textContent = "Could not find videos.";
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
const tag = document.createElement("script");
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);