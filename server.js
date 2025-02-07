import dotenv from "dotenv";
dotenv.config();
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";

const app = express();

// Increase payload limit for large image data (up to 50MB)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Secure CORS Policy
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:3000", // Allow only your frontend
  methods: "GET,POST",
  credentials: true,
};
app.use(cors(corsOptions));

// Connect to MongoDB with error handling
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((error) => {
    console.error("MongoDB Connection Error:", error);
    process.exit(1);
  });

// Define User Schema with a Buffer for faceImage and an optional OTP field
const UserSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  faceImage: { type: Buffer, required: true },
  otp: { type: String },
});

const User = mongoose.model("User", UserSchema);

//
// SIGNUP ROUTE
//
app.post("/signup", async (req, res) => {
  const { fullName, email, password, faceImage } = req.body;

  if (!fullName || !email || !password || !faceImage) {
    return res.status(400).json({ error: "All fields are required." });
  }

  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Convert Base64 image string to a binary Buffer.
    // Remove the data URL prefix if present (e.g., "data:image/png;base64,")
    const base64Data = faceImage.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    const newUser = new User({
      fullName,
      email,
      password: hashedPassword,
      faceImage: imageBuffer,
    });

    await newUser.save();
    console.log("User Registered:", newUser);
    res.status(201).json({ message: "User registered successfully." });
  } catch (error) {
    console.error("Signup error:", error);
    // Handle duplicate email error (MongoDB duplicate key error code 11000)
    if (error.code === 11000) {
      return res.status(400).json({ error: "Email already in use." });
    }
    res.status(500).json({ error: "Internal server error." });
  }
});

//
// LOGIN ROUTE: Verify email and password
//
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).send("User not found");

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).send("Invalid password");

    // Credentials are valid – return user data for further steps.
    res.json({ user });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

//
// LOGINMULTISTEP ROUTE (Alias for /login)
//
app.post("/loginmultistep", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).send("User not found");

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).send("Invalid password");

    res.json({ user });
  } catch (error) {
    console.error("Loginmultistep error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

//
// OTP GENERATION ROUTE
//
app.post("/generate-otp", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).send("User not found");

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    await user.save();

    // Configure nodemailer transporter using OAuth2
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.EMAIL,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        refreshToken: process.env.REFRESH_TOKEN,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: "OTP Code for MFA",
      text: `Your OTP for MFA is ${otp}`,
    };

    transporter.sendMail(mailOptions, (error) => {
      if (error) {
        console.error("Failed to send OTP email:", error);
        return res.status(500).send("Failed to send OTP");
      }
      res.json({ message: "OTP sent successfully" });
    });
  } catch (error) {
    console.error("OTP generation error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

//
// OTP VERIFICATION ROUTE
//
app.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).send("User not found");

    if (user.otp !== otp) return res.status(400).send("Invalid OTP");

    // OTP is valid; clear the OTP field.
    user.otp = undefined;
    await user.save();

    // Optionally, generate a JWT token if needed.
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    // Return the user data and token so the client can proceed with face recognition.
    res.json({ token, user });
  } catch (error) {
    console.error("OTP verification error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

//
// START SERVER
//
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
