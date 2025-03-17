import dotenv from "dotenv";
dotenv.config();
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import sgMail from "@sendgrid/mail";
import * as tf from "@tensorflow/tfjs-node";

// Define __dirname for ES modules
import { fileURLToPath } from "url";
import path from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
console.log("Server starting...");

// Increase payload limit for large image data (up to 50MB)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Secure CORS Policy
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  methods: "GET,POST",
  credentials: true,
};
app.use(cors(corsOptions));

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((error) => {
    console.error("MongoDB Connection Error:", error);
    process.exit(1);
  });

// Define User Schema
const UserSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  faceImage: { type: Buffer, required: true },
});
const User = mongoose.model("User", UserSchema);

// ------------------------
// Route: SIGNUP
// ------------------------
app.post("/signup", async (req, res) => {
  const { fullName, email, password, faceImage } = req.body;
  if (!fullName || !email || !password || !faceImage) {
    return res.status(400).json({ error: "All fields are required." });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const base64Data = faceImage.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");
    const newUser = new User({ fullName, email, password: hashedPassword, faceImage: imageBuffer });
    await newUser.save();
    console.log("User Registered:", email);
    res.status(201).json({ message: "User registered successfully." });
  } catch (error) {
    console.error("Signup error:", error);
    if (error.code === 11000) {
      return res.status(400).json({ error: "Email already in use." });
    }
    res.status(500).json({ error: "Internal server error." });
  }
});

// ------------------------
// Route: LOGIN
// ------------------------
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.log("User not found:", email);
      return res.status(400).send("User not found");
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log("Invalid password for:", email);
      return res.status(400).send("Invalid password");
    }
    console.log("Login successful for:", email);
    res.json({ user });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ------------------------
// Route: LOGINMULTISTEP (alias for /login)
// ------------------------
app.post("/loginmultistep", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.log("User not found:", email);
      return res.status(400).send("User not found");
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log("Invalid password for:", email);
      return res.status(400).send("Invalid password");
    }
    console.log("Loginmultistep successful for:", email);
    res.json({ user });
  } catch (error) {
    console.error("Loginmultistep error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Configure SendGrid API
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// ------------------------
// Route: OTP GENERATION
// ------------------------
app.post("/generate-otp", async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.log("User not found for OTP generation:", email);
      return res.status(400).send("User not found");
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { otp, expiresAt: Date.now() + 5 * 60 * 1000 };
    const msg = {
      to: email,
      from: process.env.SENDGRID_EMAIL,
      subject: "OTP Code for MFA",
      text: `Your OTP for MFA is ${otp}. This OTP is valid for 5 minutes.`,
    };
    await sgMail.send(msg);
    console.log("OTP sent to:", email);
    res.json({ message: "OTP sent successfully" });
  } catch (error) {
    console.error("OTP generation error:", error);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

// In-memory OTP Store
const otpStore = {};

// ------------------------
// Route: OTP VERIFICATION
// ------------------------
app.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  try {
    const storedOtpData = otpStore[email];
    if (!storedOtpData) {
      console.log("OTP expired or not requested for:", email);
      return res.status(400).send("OTP expired or not requested");
    }
    if (storedOtpData.otp !== otp) {
      console.log("Invalid OTP for:", email);
      return res.status(400).send("Invalid OTP");
    }
    if (Date.now() > storedOtpData.expiresAt) {
      console.log("OTP expired for:", email);
      return res.status(400).send("OTP expired");
    }
    delete otpStore[email];
    const user = await User.findOne({ email });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
    console.log("OTP verification successful for:", email);
    res.json({ token, user });
  } catch (error) {
    console.error("OTP verification error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ------------------------
// FACE-BASED LOGIN WITH ANTISPOOFING
// ------------------------
let faceAuthModel;
const MODEL_PATH = path.join(__dirname, "public", "models", "antispoof_model", "model.json");
console.log("Loading face authentication model from:", MODEL_PATH);

tf.loadLayersModel(`file://${MODEL_PATH}`)
  .then((model) => {
    faceAuthModel = model;
    console.log("Face authentication model loaded successfully.");
  })
  .catch((err) => {
    console.error("Error loading face authentication model:", err);
  });

console.log("check1");

// Helper: Preprocess image for antispoofing (expects input shape [1, 32, 32, 3])
async function processImageForAntispoof(imageBuffer) {
  console.log("processImageForAntispoof called");
  try {
    const decodedImage = tf.node.decodeImage(imageBuffer, 3);
    console.log("Decoded image shape:", decodedImage.shape);
    const resizedImage = tf.image.resizeBilinear(decodedImage, [32, 32]);
    console.log("Resized image shape:", resizedImage.shape);
    const normalizedImage = resizedImage.div(255.0);
    normalizedImage.print();
    return normalizedImage.expandDims(0);
  } catch (err) {
    console.error("Error in processImageForAntispoof:", err);
    throw err;
  }
}

// ------------------------
// Route: FACE-BASED LOGIN (with antispoofing)
// ------------------------
app.post("/face-login", async (req, res) => {
  console.log("Face login route hit for:", req.body.email);
  const { email, faceImage } = req.body;
  if (!email || !faceImage) {
    return res.status(400).json({ error: "Email and face image are required" });
  }
  try {
    if (!faceAuthModel) {
      console.log("Face authentication model not loaded yet.");
      return res.status(500).json({ error: "Face authentication model not loaded" });
    }
    const user = await User.findOne({ email });
    if (!user) {
      console.log("User not found for face login:", email);
      return res.status(400).json({ error: "User not found" });
    }
    const inputBase64 = faceImage.replace(/^data:image\/\w+;base64,/, "");
    const inputBuffer = Buffer.from(inputBase64, "base64");
    const inputTensor = await processImageForAntispoof(inputBuffer);
    console.log("Input tensor shape:", inputTensor.shape);
    
    // Run antispoofing inference:
    const predictionTensor = faceAuthModel.predict(inputTensor);
    const predictionData = predictionTensor.dataSync();
    console.log("Raw model output:", predictionData);
    
    // Convert logits to probabilities using softmax:
    const expScores = predictionData.map(score => Math.exp(score));
    const sumExp = expScores.reduce((a, b) => a + b, 0);
    const probabilities = expScores.map(expScore => expScore / sumExp);
    console.log("Softmax probabilities:", probabilities);
    
    // Determine predicted class (0 = live, 1 = spoof)
    const predictedClass = probabilities.indexOf(Math.max(...probabilities));
    console.log("Predicted class (0 = live, 1 = spoof):", predictedClass);
    
    // Adjust threshold: if spoof probability (index 1) is higher than threshold, reject.
    // Experiment with the threshold value (e.g., try 0.70, 0.75, or 0.80)
    // option1
    const spoofThreshold = 0.6;
    if (probabilities[1] > spoofThreshold) {
      console.log("Spoof detected with probability:", probabilities[1]);
      return res.status(400).json({ error: "Spoof detected. Live face required for login." });
    }

    // option2
    /*const margin = probabilities[0] - probabilities[1];
    console.log("Live - Spoof probability margin:", margin);
    const marginThreshold = 0.15; // Example: live must be at least 15% higher than spoof
    if (margin < marginThreshold) {
      console.log("Insufficient margin, possible spoof. Live probability:", probabilities[0], "Spoof probability:", probabilities[1]);
      return res.status(400).json({ error: "Spoof detected. Live face required for login." });
    } */

    
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
    console.log("Face login successful for:", email);
    res.json({ message: "Face login successful", token, user });
  } catch (error) {
    console.error("Face login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ------------------------
// START SERVER
// ------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
