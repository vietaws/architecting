import express from "express";
import os from "os";
import bodyParser from "body-parser";


const app = express();


app.use(bodyParser.json()); // to support JSON-encoded bodies
app.use(
  bodyParser.urlencoded({
    // to support URL-encoded bodies
    extended: true,
  })
);

const BACKGROUND_COLOR = process.env.BACKGROUND_COLOR || "#283E5B";
const APP_PORT = process.env.PORT || 3001;

app.get("/", async (req, res) => {
  try {

    const containerIp = req.socket.localAddress;
    const containerName = os.hostname();
    console.log("os hostname: ", os.hostname());
    const ip = containerIp.split(":")[3];
    const version = 5;
    const bgColor = BACKGROUND_COLOR;
    const html = `
    <html>
    <head>
      <title>Application Demo</title>
    </head>
    <body style='background-color: ${bgColor}; color: wheat;text-align: center;'>
      <h1 style='color: orange'>Welcome to AWS</h1>
      <h3>Container name: <span style='color: pink'>${containerName}</span></h3>
      <h3>Container's IP Address: <span style='color: pink'>${ip}</span></h3>
      <h3>Application Version: <span style='color: coral'>V${version}</span></h3>
    <body>
    </html>
    `;
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});


app.listen(APP_PORT, () => {
  console.log(`Server is running at port ${APP_PORT}!`);
});