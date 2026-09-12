CREATE TABLE market_test_fixtures (
  request_id TEXT PRIMARY KEY REFERENCES market_drafts(request_id),
  fixture TEXT NOT NULL CHECK(fixture='plus-one')
);
