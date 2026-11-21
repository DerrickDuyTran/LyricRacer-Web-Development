require("dotenv").config();

let axios = require("axios");
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const app = express();
const WebSocket = require("ws");

const port = 3000;
const hostname = "localhost";

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 3600000
  }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

passport.use(new GoogleStrategy({clientID: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, callbackURL: process.env.GOOGLE_CALLBACK_URL}, (accessToken, refreshToken, profile, done) => {
    const user = {
      id: profile.id,
      name: profile.displayName,
      email: profile.emails?.[0]?.value,
      picture: profile.photos?.[0]?.value
    };
    return done(null, user);
  }
));

app.use(express.static("public"));

app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"]}));

app.get("/auth/google/callback", passport.authenticate("google", { failureRedirect: "/"}), (req, res) => {res.redirect("/");});

app.get("/api/me", (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      loggedIn: true,
      user: req.user
    });
  } else {
    res.json({
      loggedIn: false
    });
  }
});

app.get("/logout", (req, res, next) => {
  req.logout((error) => {
    if (error) {
      return next(error);
    }
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.redirect("/");
    });
  });
});


app.get("/api/lyrics", (req, res) => {
  let track = req.query.track;
  let artist = req.query.artist;
  if (typeof track !== "string" || track.trim() === "") {
    res.status(400).json({error: "Enter a song title"});
    return;
  }

  let url = "https://lrclib.net/api/search?track_name=" + track;
  if (typeof artist === "string" && artist.length > 0) {
    url += "&artist_name=" + artist;
  }

  axios(url, {
    headers: {"Lrclib-Client": "LyricRacer v1.0.0 (https://github.com/DerrickDuyTran/LyricRacer-Web-Development)"}
  }).then(response => {
    let results = response.data;

    let syncedLyrics;
    for (let result of results) {
      if (result.syncedLyrics) {
        syncedLyrics = result.syncedLyrics;
        break;
      }
    }
    if (syncedLyrics === undefined) {
      res.status(404).json({error: "No timed lyrics found"});
      return;
    }
    res.status(200).json({
      syncedLyrics: syncedLyrics
    });
  }).catch(error => {
    console.log(error);
    res.status(502).json({error: "Could not connect to LRCLIB"});
  });
});

app.get("/api/youtube", async (req, res) => {
  let track = req.query.track;
  let artist = req.query.artist || "";
  if (typeof track !== "string" || track.trim() === "") {
    return res.status(400).json({error: "Enter a song title"});
  }
  let baseQuery = `${track} ${artist}`.trim();

  try {
    let audioResponse = await axios.get("https://www.googleapis.com/youtube/v3/search", {
      params: {
        part: "snippet",
        q: `${baseQuery} lyrics`,
        type: "video",
        maxResults: 1,
        key: process.env.YOUTUBE_API_KEY
      }
    }
  );
  let audioVideo = audioResponse.data.items[0];
  if (!audioVideo) {
    return res.status(404).json({
      error: "Could not find YouTube videos"
    });
  }

  res.json({
    audioVideoId: audioVideo.id.videoId,
    audioTitle: audioVideo.snippet.title,
  });
  } catch (error) {
    console.log("YouTube API error:");
    console.log(error.response?.data || error.message);
    res.status(502).json({error: "Could not connect to YouTube"});
  }
});

const server = app.listen(port, hostname, () => {
  console.log(`Listening at: http://${hostname}:${port}`);
});

const wss = new WebSocket.Server({ server: server });
let rooms = {};

function makeCode() {
  let letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";

  while (code === "" || rooms[code]) {
    code = "";
    for (let i = 0; i < 4; i++) {
      code += letters[Math.floor(Math.random() * letters.length)];
    }
  }
  return code;
}

function clamp(value, max) {
  value = Number(value);

  if (isNaN(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), max);
}

function sendRoom(room) {
  let players = [];

  for (let player of room.players) {
    players.push({
      name: player.name,
      progress: player.progress,
      wpm: player.wpm,
      accuracy: player.accuracy,
      score: player.score,
      finished: player.finished
    });
  }

  for (let i = 0; i < room.players.length; i++) {
    let socket = room.players[i].ws;

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "room",
        code: room.code,
        status: room.status,
        you: i,
        players: players
      }));
    }
  }
}

function joinRoom(ws, msg) {
  let code = "";
  if (typeof msg.code === "string") {
    code = msg.code.trim().toUpperCase();
  }

  if (code === "") {
    code = makeCode();
    rooms[code] = {code: code, status: "lobby", players: []};
  }

  let room = rooms[code];

  if (!room) {
    ws.send(JSON.stringify({type: "error", error: "Room not found"}));
    return;
  }

  if (room.status === "playing" || room.players.length >= 4) {
    ws.send(JSON.stringify({type: "error", error: "Room full or game in progress"}));
    return;
  }

  let name = String(msg.name || "Guest").substring(0, 20);
  let player = {ws: ws, name: name, progress: 0, wpm: 0, accuracy: 0, score: 0, finished: false};

  room.players.push(player);
  ws.room = room;
  ws.player = player;
  sendRoom(room);
}

function startGame(ws, msg) {
  let room = ws.room;

  if (room.players[0] !== ws.player || room.status === "playing") {
    return;
  }

  let track = String(msg.track || "").trim();

  if (track === "") {
    ws.send(JSON.stringify({type: "error", error: "Enter a song title before starting"}));
    return;
  }

  room.status = "playing";
  for (let player of room.players) {
    player.progress = 0;
    player.wpm = 0;
    player.accuracy = 0;
    player.score = 0;
    player.finished = false;
  }

  for (let player of room.players) {
    player.ws.send(JSON.stringify({
      type: "start",
      track: String(msg.track || "").substring(0, 100),
      artist: String(msg.artist || "").substring(0, 100)
    }));
  }
  sendRoom(room);
}

function updateProgress(ws, msg) {
  let room = ws.room;
  let player = ws.player;

  if (room.status !== "playing") {
    return;
  }

  player.progress = clamp(msg.progress, 1);
  player.wpm = clamp(msg.wpm, 400);
  player.accuracy = clamp(msg.accuracy, 100);
  player.score = clamp(msg.score, 1000000);
  sendRoom(room);
}

function checkFinished(room) {
  if (room.status !== "playing") {
    return;
  }

  for (let player of room.players) {
    if (!player.finished) {
      return;
    }
  }
  room.status = "finished";
}

wss.on("connection", ws => {
  ws.on("message", data => {
    let msg;

    try {
      msg = JSON.parse(data);
    } catch (error) {
      return;
    }

    if (msg.type === "join" && !ws.room) {
      joinRoom(ws, msg);
    } else if (msg.type === "start" && ws.room) {
      startGame(ws, msg);
    } else if (msg.type === "progress" && ws.room) {
      updateProgress(ws, msg);
    } else if (msg.type === "finish" && ws.room && ws.room.status === "playing") {
      ws.player.finished = true;
      ws.player.progress = 1;
      checkFinished(ws.room);
      sendRoom(ws.room);
    }
  });

  ws.on("close", () => {
    let room = ws.room;

    if (!room) {
      return;
    }

    room.players = room.players.filter(player => player !== ws.player);

    if (room.players.length === 0) {
      delete rooms[room.code];
    } else {
      checkFinished(room);
      sendRoom(room);
    }
  });
});