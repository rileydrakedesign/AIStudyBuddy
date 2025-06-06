import logger from "../utils/logger.js";
import mongoose, { connect, disconnect } from "mongoose";
let mainDbConnected = false;
let studyBuddyConnection = null;
/**
 * Connect to the main DB as before.
 * If your .env includes '?dbName=test' or you pass dbName: 'test',
 * that remains the default for all your old code.
 */
async function connectToDatabase() {
    try {
        if (!mainDbConnected) {
            await connect(process.env.MONGO_CONNECTION_STRING);
            // or pass dbName: "test" if you specifically want that:
            // await connect(process.env.MONGO_CONNECTION_STRING!, { dbName: "test" });
            mainDbConnected = true;
            logger.info("Connected to main DB (legacy) successfully.");
        }
    }
    catch (error) {
        logger.error(error, "Could not connect to MongoDB (main)");
        throw new Error("Could not Connect To MongoDB (main)");
    }
}
/**
 * Disconnect from the main DB
 */
async function disconnectFromDatabase() {
    try {
        if (mainDbConnected) {
            await disconnect();
            mainDbConnected = false;
            logger.info("Disconnected from main DB (legacy).");
        }
    }
    catch (error) {
        logger.error(error, "Could not disconnect from MongoDB (main)");
        throw new Error("Could not Disconnect From MongoDB (main)");
    }
}
/**
 * Connect to the 'study_buddy_demo' DB specifically for chunk data.
 * This uses mongoose.createConnection so we don't break the main connection.
 */
async function connectToStudyBuddyDb() {
    try {
        if (studyBuddyConnection) {
            // Return existing connection if already connected
            return studyBuddyConnection;
        }
        // Create a new separate connection
        studyBuddyConnection = mongoose.createConnection(process.env.MONGO_CONNECTION_STRING, {
            dbName: "study_buddy_demo"
        });
        // Wait for connection to open
        await new Promise((resolve, reject) => {
            studyBuddyConnection?.once("open", () => {
                logger.info("Connected to study_buddy_demo DB for chunk data.");
                resolve();
            });
            studyBuddyConnection?.on("error", (err) => {
                logger.error(err, "Error connecting to study_buddy_demo");
                reject(err);
            });
        });
        return studyBuddyConnection;
    }
    catch (error) {
        logger.error(error, "Could not connect to study_buddy_demo DB");
        throw new Error("Could not connect to study_buddy_demo DB");
    }
}
/**
 * Disconnect from the 'study_buddy_demo' DB
 */
async function disconnectFromStudyBuddyDb() {
    try {
        if (studyBuddyConnection) {
            await studyBuddyConnection.close();
            studyBuddyConnection = null;
            logger.info("Disconnected from study_buddy_demo DB.");
        }
    }
    catch (error) {
        logger.error(error, "Could not disconnect from study_buddy_demo DB");
        throw new Error("Could not disconnect from study_buddy_demo DB");
    }
}
// Export original functions unchanged + new study buddy DB functions
export { connectToDatabase, disconnectFromDatabase, connectToStudyBuddyDb, disconnectFromStudyBuddyDb };
//# sourceMappingURL=connection.js.map