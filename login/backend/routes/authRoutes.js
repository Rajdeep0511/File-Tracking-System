const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const db = require("../database"); 
const router = express.Router();
const dbHelpers = require("./dbHelpers"); 

const getTable = (role) => {
  if (role === 'admin') {
    return "admins"; // Admins go into the 'admins' table
  }
  return "users"; // All other roles go into the 'users' table
};

// REGISTER
router.post("/register", async (req, res) => {
  const { username, email, contact, password, officeName, role } = req.body;

  // Basic validation for required fields
  if (!username || !email || !contact || !password || !role) {
    return res.status(400).json({ error: "All required fields (username, email, contact, password, role) must be provided." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    let sql;
    let values;

    // --- MAJOR FIX: Logic is now branched directly on the 'role' ---
    if (role === 'admin') {
      // --- Admin Registration Logic ---
      // This block now correctly handles admin registration.
      sql = `
        INSERT INTO admins (username, email, contact, password)
        VALUES (?, ?, ?, ?)
      `;
      values = [username, email, contact, hashedPassword];

    } else {
      // --- User (citizen/organization) Registration Logic ---
      // This block handles all non-admin roles.
      if (role === 'organization' && !officeName) {
        return res.status(400).json({ error: "Organization name is required for the organization role." });
      }
      
      sql = `
        INSERT INTO users (username, email, contact, password, role, officeName)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      values = [username, email, contact, hashedPassword, role, officeName || null];
    }

    // Execute the determined SQL query
    await db.execute(sql, values);

    res.status(201).json({ message: `${role.charAt(0).toUpperCase() + role.slice(1)} registered successfully!` });

  } catch (err) {
    console.error("Register error:", err);
    // Handle duplicate entry errors for better user feedback
    if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
      let errorMessage = "User with this information already exists.";
      if (err.message.includes('username')) {
        errorMessage = "Username already taken.";
      } else if (err.message.includes('email')) {
        errorMessage = "Email address already registered.";
      }
      return res.status(409).json({ error: errorMessage });
    }
    res.status(500).json({ error: "Database error during registration." });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  const { username, password, role } = req.body;
  
  if (!username || !password || !role) {
      return res.status(400).json({ error: "Username, password, and role are required." });
  }

  const table = getTable(role);

  try {
    const [results] = await db.execute(`SELECT * FROM ${table} WHERE username = ?`, [username]);
    if (results.length === 0) {
        return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        return res.status(401).json({ error: "Invalid credentials" });
    }
    
    // --- FIX: Explicitly set the role for admins ---
    // The 'admins' table does not have a 'role' column, so we must add it here.
    const userRole = (role === 'admin') ? 'admin' : user.role;

    res.json({
      message: "Logged in successfully!",
      user: {
        username: user.username,
        email: user.email,
        // 'designation' might not exist on all tables, use optional chaining or provide a default
        designation: user.designation || null, 
        role: userRole
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Database error during login." });
  }
});


// FORGOT PASSWORD
// NOTE: This assumes you have a 'dbHelpers' file with functions to handle DB operations.
// If not, you'll need to implement the logic directly here.
router.post("/forgot-password", async (req, res) => {
  const { email, role } = req.body;
  const table = getTable(role);

  try {
    const user = await dbHelpers.findUserByEmail(email, table);
    if (!user) {
        return res.status(404).json({ error: `User with role '${role}' not found.` });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiry = Date.now() + 15 * 60 * 1000; // 15 minutes

    // await dbHelpers.storeResetToken(email, resetToken, expiry, table);
    // Direct implementation:
    await db.execute(
        `UPDATE ${table} SET reset_token = ?, reset_token_expiry = ? WHERE email = ?`,
        [resetToken, expiry, email]
    );

    const resetLink = `http://localhost:3000/reset-password/${resetToken}?role=${role}`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER, // It's better to use environment variables
        pass: process.env.GMAIL_APP_PASSWORD // Use an App Password for security
      }
    });

    await transporter.sendMail({
      from: `"Document System" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: "Password Reset Request",
      html: `<p>You requested a password reset. Click this <a href="${resetLink}">link</a> to reset your password. The link will expire in 15 minutes.</p>`
    });

    res.json({ message: "Reset link sent to your email" });
  } catch (err) {
    console.error("Forgot Password Error:", err);
    res.status(500).json({ error: "Server error while sending reset email." });
  }
});


// RESET PASSWORD
router.post("/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { password, role } = req.body;

  if (!password || !role) {
      return res.status(400).json({ error: "Password and role are required." });
  }

  const table = getTable(role);

  try {
    const [results] = await db.execute(
      `SELECT * FROM ${table} WHERE reset_token = ? AND reset_token_expiry > ?`,
      [token, Date.now()]
    );
    if (results.length === 0) {
        return res.status(400).json({ error: "Invalid or expired token. Please try again." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.execute(
      `UPDATE ${table} SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?`,
      [hashedPassword, results[0].id]
    );

    res.json({ message: "Password has been updated successfully." });
  } catch (err) {
    console.error("Reset Password Error:", err);
    res.status(500).json({ error: "Failed to reset password." });
  }
});


module.exports = router;
