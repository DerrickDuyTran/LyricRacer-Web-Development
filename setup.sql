DROP DATABASE IF EXISTS lyricracer;
CREATE DATABASE lyricracer;
\c lyricracer

CREATE TABLE users (
  google_id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL
);

CREATE TABLE scores (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(google_id),
  song_title VARCHAR(255) NOT NULL,
  score INT NOT NULL
);
