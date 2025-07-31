const mysql = require("mysql2");

const db = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "raj@2003",
    database: "auth_system",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
db.getConnection((err, connection) => {
    if (err) {
        console.error("❌ MySQL connection failed:", err.message);
    } else {
        console.log("✅ Connected to MySQL!");
        connection.release(); // Always release the connection back to the pool
    }
});

module.exports = db.promise(); 
