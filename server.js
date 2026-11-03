let axios = require("axios");
const express = require("express");
const app = express();

const port = 3000;
const hostname = "localhost";

app.use(express.static("public"));

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

app.listen(port, hostname, () => {
  console.log(`Listening at: http://${hostname}:${port}`);
});
