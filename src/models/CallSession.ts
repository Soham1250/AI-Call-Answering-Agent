import { Schema, model } from "mongoose";

const CallSession = new Schema({
  caller: String,
  callee: String,
  locale: String,
  outcome: String,
}, { timestamps: true });

export default model("CallSession", CallSession);
