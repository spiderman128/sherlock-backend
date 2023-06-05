import DBHelper from "./sqlHelper.js";
/**
 * Initialize SQLite Database.
 */
export default class InitDatabase {
  /**
   * SQL statements to initialize the Database.
   * remain version adding and part of configuration.
   */
  static #InitSQLStatements = `
        BEGIN TRANSACTION;
        
        CREATE TABLE IF NOT EXISTS qna_table (
            qnaId INTEGER PRIMARY KEY,
            orgId INTEGER NOT NULL,
            question TEXT NOT NULL,
            answer INTEGER NOT NULL,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        );

        COMMIT;
     `;

  /**
   * Initialize SQLite3 DB.
   *
   * @param {string} basePath - base path for the database creation.
   * @param {boolean} debug - debug mode with default value false.
   * @return {boolean} - true if initialize successfully.
   */
  static async open(basePath, debug = false) {
    if (!DBHelper.isDBOpened) {
      await DBHelper.openDB(basePath, debug);
      await DBHelper.initializeDB(this.#InitSQLStatements, debug);
      return true;
    } else {
      throw new Error(`InitDatabase: SQLite3 DB already open.`);
    }
  }
  /**
   * Close SQLite3 DB
   */
  static async close() {
    if (DBHelper.isDBOpened) {
      await DBHelper.closeDB();
      // 5sec to let close the db.
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } else {
      throw new Error(`InitDatabase: SQLite3 DB already close.`);
    }
  }
}
