let lyrics = [];
let lyricParagraphs = [];
let seconds = 0;
let timerId;
let currentIndex = -1;

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
      let lyric = line.substring(closingBracketIndex + 1);
      let timeParts = timestamp.split(":");

      let minutes = Number(timeParts[0]);
      let seconds = Number(timeParts[1]);

      lyrics.push({time: minutes * 60 + seconds, text: lyric});
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
    document.getElementById("current-lyric").textContent = lyrics[currentIndex].text;
    lyricParagraphs[currentIndex].classList.add("active");
  }
}

function startTimer() {
  clearInterval(timerId);
  seconds = 0;
  currentIndex = -1;
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
