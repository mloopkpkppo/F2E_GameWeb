CREATE TABLE IF NOT EXISTS user_favorites (
  steamid TEXT NOT NULL,
  appid INTEGER NOT NULL,
  PRIMARY KEY (steamid, appid)
);
