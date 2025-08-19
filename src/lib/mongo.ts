import mongoose from "mongoose";

export async function connectMongo(uri = process.env.MONGODB_URI!) {
  if (!uri) throw new Error("MONGODB_URI missing");
  if (mongoose.connection.readyState === 1) return mongoose;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log("[mongo] connected");
  return mongoose;
}
