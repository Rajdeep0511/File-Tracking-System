const express = require("express");
const db = require("../database"); // Make sure this exports db.promise()
const router = express.Router();

router.post("/new-document", async (req, res) => {
  console.log("=== RECEIVED BODY FROM FRONTEND ===");
  console.log(req.body);
  console.log("===================================");

  const {
    id, senderOrg, applicantName, orgEmail, contactNumber,
    receivedOffice, receiptDate, purpose, details,
    status = "Submitted", submittedBy, role
  } = req.body;

  // 🛑 Prevent document submission by citizen
  if (role === 'citizen') {
    return res.status(403).json({ success: false, message: "Citizens are not allowed to submit documents." });
  }

  if (!senderOrg || !applicantName || !receivedOffice || !submittedBy || !contactNumber) {
    console.log("Validation failed on backend. Missing fields:");
    console.log("senderOrg:", senderOrg);
    console.log("applicantName:", applicantName);
    console.log("receivedOffice:", receivedOffice);
    console.log("submittedBy:", submittedBy);
    console.log("contactNumber:", contactNumber);

    return res.status(400).json({
      success: false,
      message: "Missing required fields",
    });
  }

  const query = `
    INSERT INTO document (
      document_id, senderOrg, applicantName, orgEmail, contactNumber, 
      receivedOffice, receiptDate, purpose, details, status, submittedBy
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    id, senderOrg, applicantName, orgEmail || null, contactNumber,
    receivedOffice, receiptDate || new Date().toISOString().split("T")[0],
    purpose || null, details || null, status, submittedBy
  ];

  try {
    await db.execute(query, values);
    res.status(201).json({ success: true, message: "Document submitted", documentId: id });
  } catch (err) {
    console.error("Error inserting document:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
//Search documents
router.get("/search-documents", async (req, res) => {
  const query = req.query.query?.trim() || '';
  const submittedBy = req.query.email ?? null;
  const role = req.query.role ?? 'user';

  let sql = `SELECT `;
  const params = [];
  const whereClauses = [];

  // 🎯 Select different fields based on role
  if (role === 'citizen') {
    sql += `
      document_id AS id, senderOrg, applicantName,
      receivedOffice, receiptDate, purpose, details, status, submittedBy
    `;
  } else {
    sql += `
      document_id AS id, senderOrg, applicantName, orgEmail,
      receivedOffice, receiptDate, purpose, details, status, submittedBy
    `;
  }

  sql += ` FROM document `;

  // 🔍 Build WHERE clauses
  if (role === 'citizen') {
    if (!query) {
      return res.status(400).json({ error: "Search query is required for citizens" });
    }

    // ❗ Only allow search by document_id or contactNumber
    whereClauses.push(`
      document_id LIKE ? OR
      contactNumber LIKE ?
    `);
    params.push(`%${query}%`, `%${query}%`);

  } else if (role !== 'admin') {
    if (!query || !submittedBy) {
      return res.status(400).json({ error: "Search query and email are required" });
    }

    whereClauses.push("submittedBy = ?");
    params.push(submittedBy);

    whereClauses.push(`
      document_id LIKE ? OR
      senderOrg LIKE ? OR
      applicantName LIKE ?
    `);
    params.push(`%${query}%`, `%${query}%`, `%${query}%`);
  } else {
    if (query) {
      whereClauses.push(`
        document_id LIKE ? OR
        senderOrg LIKE ? OR
        applicantName LIKE ? OR
        orgEmail LIKE ?
      `);
      params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
    }
  }

  if (whereClauses.length > 0) {
    sql += ` WHERE ` + whereClauses.join(' AND ');
  }

  try {
    const [results] = await db.execute(sql, params);
    res.json(results);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Database error" });
  }
});



// Delete document (admin only)
router.delete("/documents/:id", async (req, res) => {
  const documentId = req.params.id;
  const { role } = req.body;

  if (role !== 'admin') {
    return res.status(403).json({ error: "Forbidden: You do not have permission to delete." });
  }

  try {
    const [result] = await db.execute("DELETE FROM document WHERE document_id = ?", [documentId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Document not found" });
    }
    res.json({ message: "Document deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Failed to delete", details: err.message });
  }
});

// Update document status (admin only)
router.put("/documents/:id", async (req, res) => {
  const { status, role } = req.body;
  const documentId = req.params.id;

  if (role !== 'admin') {
    return res.status(403).json({ error: "Unauthorized: Only admin can update status" });
  }

  try {
    const [result] = await db.execute(
      "UPDATE document SET status = ? WHERE document_id = ?",
      [status, documentId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json({ message: "Document status updated" });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ error: "Failed to update", details: err.message });
  }
});

module.exports = router;