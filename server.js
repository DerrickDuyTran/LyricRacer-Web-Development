require("dotenv").config();

let axios = require("axios");
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const app = express();

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
    let musicResponse = await axios.get("https://www.googleapis.com/youtube/v3/search", {
      params: {
        part: "snippet",
        q: `${baseQuery} music video`,
        type: "video",
        maxResults: 1,
        key: process.env.YOUTUBE_API_KEY
      }
    }
  );
  let audioVideo = audioResponse.data.items[0];
  let musicVideo = musicResponse.data.items[0];
  if (!audioVideo || !musicVideo) {
    return res.status(404).json({
      error: "Could not find both YouTube videos"
    });
  }

  res.json({
    audioVideoId: audioVideo.id.videoId,
    audioTitle: audioVideo.snippet.title,
    musicVideoId: musicVideo.id.videoId,
    musicTitle: musicVideo.snippet.title
  });
  } catch (error) {
    console.log("YouTube API error:");
    console.log(error.response?.data || error.message);
    res.status(502).json({error: "Could not connect to YouTube"});
  }
});

app.listen(port, hostname, () => {
  console.log(`Listening at: http://${hostname}:${port}`);
});
