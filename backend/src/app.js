import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { createServer } from "node:http";
import mongoose from "mongoose";
import {connectToSocket} from "./controllers/socketManager.js";
import userRoutes from "./routes/users.routes.js";

const app = express();
const server = createServer(app);
const io = connectToSocket(server);

app.set("port", (process.env.PORT || 8000));
// app.get("/home", (req, res) => {
//   return res.json({ message: "Hello World" });
// });
app.use(cors());
app.use(express.json({limit: "40kb"}));
app.use(express.urlencoded({ limit: "40kb", extended: true }));
app.use("/api/v1/users", userRoutes); // used in localhost:8000/api/v1/users/login or register

const start = async () => {

    app.set("mongo_user")
    const connectionDb = await mongoose.connect("mongodb+srv://hs2287675:dabbu004@cluster0.bniyz.mongodb.net/")
    console.log("Database connected")
  server.listen(app.get("port"), () => {
    console.log("Server is running on port 8000");
  });
};
start();
