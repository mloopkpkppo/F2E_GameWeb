CREATE TABLE steam_login_nonces (
  nonce TEXT PRIMARY KEY,
  expires INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX steam_login_nonces_expiry ON steam_login_nonces(expires);
