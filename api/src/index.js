
const express = require("express");

const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:3001");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());

const ingestRouter = require("./routes/ingest");
app.use("/ingest", ingestRouter);

const groupsRouter = require("./routes/groups");
app.use("/groups", groupsRouter);

const offeringsRouter = require("./routes/offerings");
app.use("/offerings", offeringsRouter);

app.get("/", (req, res) => {
  res.send("API running");
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
