const db = require("../database");

const findUserByEmail = async (email, table) => {
  try {
    const [results] = await db.execute(`SELECT * FROM ${table} WHERE email = ?`, [email]);
    return results[0];
  } catch (err) {
    throw err;
  }
};

const storeResetToken = async (email, token, expiry, table) => {
  try {
    const [results] = await db.execute(
      `UPDATE ${table} SET reset_token = ?, reset_token_expiry = ? WHERE email = ?`,
      [token, expiry, email]
    );
    return results;
  } catch (err) {
    throw err;
  }
};

module.exports = {
  findUserByEmail,
  storeResetToken
};
