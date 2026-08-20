import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { createServer } from "node:http";
import mongoose from "mongoose";
import { connectToSocket } from "./controllers/socketManager.js";
import userRoutes from "./routes/users.routes.js";
// Use dotenv if you are testing locally (npm install dotenv)
// import 'dotenv/config'; 

const app = express();
const server = createServer(app);
const io = connectToSocket(server);

app.set("port", (process.env.PORT || 8000));

app.use(cors());
app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ limit: "40kb", extended: true }));
app.use("/api/v1/users", userRoutes); 

const start = async () => {
    try {
        // FIXED: Replaced hardcoded credentials with Environment Variable
        const connectionDb = await mongoose.connect(process.env.MONGO_URI || "mongodb+srv://hs2287675:dabbu004@cluster0.bniyz.mongodb.net/?appName=Cluster0");
        console.log("Database connected successfully");
        
        server.listen(app.get("port"), () => {
            console.log(`Server is running on port ${app.get("port")}`);
        });
    } catch (error) {
        console.error("Database connection failed:", error);
    }
};

start();