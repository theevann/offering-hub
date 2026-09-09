## Bot

- [ ] Allow replay of bot messages that failed to reach the API

## API

- [ ] Decide category-specific expiresAt defaults; currently endTime or seven days after creation #api
- [ ] Secure the groups and ingest endpoints #api
- [ ] Build proper logger for all requests and responses #api

## Frontend

- [ ] Design a location-first frontend with server-side location filtering #frontend
- [ ] Clarify the frontend “created at time” requirement #frontend

## Deduplication

- [ ] Return the full LLM response from deduplication #deduplication
- [ ] Adapt deduplication by category; for undated offerings, check same-category offerings that have not expired #deduplication
- [ ] Use expiry time in deduplication #deduplication
- [ ] If a duplicate is found, also maybe merge info !

## Location

- [ ] Extract locations from Google Maps links in messages #location
- [ ] Evaluate bounding-box prefiltering before ST_DWithin: location && ST_Expand(user_location.geom, radiusMeters) #location

## Parsing

- [ ] Add startTimePrecision: unknown, wholeDay, fixedTime #parsing
- [ ] Handle SALE and RENTAL start/end dates #parsing
- [ ] Combine multipart messages from the same user and group within a proposed two-minute window #parsing
- [ ] Handle events spanning multiple days #parsing
- [ ] Parse contact information, including phone and email #parsing
- [ ] Define and extract offering tags such as meditation, yoga, breathwork, and ecstatic dance #parsing
- [ ] Add group descriptions and rules/info to the group model and parsing context #parsing
- [ ] Parse and store advice #parsing
- [ ] Validate date handling against the [example messages](todo-notes.md#examples), including February 23/24, 2026 and PARSE_PARTIAL for uncertain dates #parsing
- [ ] Add an optional per-group cheap-model offering precheck returning YES/NO and CATEGORY #parsing

## In Progress

## Done

- [x] Make a Trello-like board with linked [implementation notes and examples](todo-notes.md)
- [x] Skip parsing exact duplicates or messages with fewer than 50 characters and no image #parsing
- [x] Implement the parsing stage #parsing
- [x] Check for deduplication when date, time, and category match #deduplication
- [x] Handle recurring events, adding occurrences only for the next week #parsing
- [x] Handle one raw message producing multiple offerings #parsing

%% kanban:settings
{"lane-width":270,"date-format":"YYYY-MM-DD","time-format":"HH:mm","show-checkboxes":true,"new-card-insertion-method":"append","hide-card-count":false,"move-tags":true,"tag-action":"kanban","tag-colors":[],"tag-sort":[],"move-dates":true,"date-trigger":"@","time-trigger":"@","date-display-format":"YYYY-MM-DD","show-relative-date":false,"date-picker-week-start":1,"archive-with-date":false,"append-archive-date":false,"archive-date-separator":" ","archive-date-format":"YYYY-MM-DD","max-archive-size":-1,"inline-metadata-position":"body","move-task-metadata":true,"new-note-template":"","new-note-folder":"","show-add-list":true,"show-archive-all":true,"show-view-as-markdown":true,"show-board-settings":true,"show-search":true,"show-set-view":true,"full-list-lane-width":false,"show-title":true}
%%
