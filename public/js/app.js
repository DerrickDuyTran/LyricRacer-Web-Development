let lyrics = [];
let lyricParagraphs = [];
let seconds = 0;
let timerId;
let currentIndex = -1;
let currentText = "";

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
  document.getElementById("timer").textContent = formatTime(seconds);

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
  document.getElementById("current-lyric").textContent =
    "Waiting for lyrics...";
  updateLyrics();

  timerId = setInterval(() => {
    seconds += 1;
    updateLyrics();
  }, 1000);
}

document.getElementById("search").addEventListener("click", () => {
  let track = document.getElementById("track").value;
  let artist = document.getElementById("artist").value;

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

checkLoginStatus();

document.getElementById("typing-input").addEventListener("input", renderTyping);