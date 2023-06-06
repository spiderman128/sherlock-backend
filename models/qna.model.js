import DBHelper from "./sqlHelper.js";
/**
 * QnA Model for SQLite3 DB.
 */
export default class QnAModel {
  /**
   * QnA SQL statement.
   */

  static #insertQuery = `
        INSERT INTO qna_table
        (orgId, question, answer, createdAt, updatedAt)
        VALUES ( ?, ?, ?, 
          DATETIME('now','localtime'), DATETIME('now','localtime'))`;

  static #getIDQuery = `
        SELECT 
            qnaId
        FROM qna_table
            WHERE question = $question`;

  static #getQnAQuery = `
     SELECT 
        orgId,
        answer,
        question
     FROM qna_table
         WHERE qnaId = $qnaId`;

  static #deleteQuery = `
        DELETE FROM qna_table
            WHERE qnaId = $qnaId`;

  static async insert(orgId, question, answer, debug = false) {
    const prepareData = [orgId, question, answer];
    if (DBHelper.isDBOpened) {
      return await DBHelper.runQueryOnDB(
        "run",
        QnAModel.#insertQuery,
        prepareData,
        debug
      );
    } else {
      throw new Error(`QnA Insert: SQLite3 DB not open.`);
    }
  }

  static async delete(question, debug = false) {
    if (DBHelper.isDBOpened) {
      const qnaId = await DBHelper.runQueryOnDB(
        "get",
        this.#getIDQuery,
        { $question: question },
        debug
      );
      console.log(qnaId, "Is deleted");
      await DBHelper.runQueryOnDB(
        "run",
        this.#deleteQuery,
        { $qnaId: qnaId },
        debug
      );
      return qnaId;
    } else {
      throw new Error(`QnA Delete: SQLite3 DB not open.`);
    }
  }

  static async getQnA(qnaId, debug = false) {
    if (DBHelper.isDBOpened) {
      return await DBHelper.runQueryOnDB(
        "get",
        this.#getQnAQuery,
        { $qnaId: qnaId },
        debug
      );
    } else {
      throw new Error(`QnA Get: SQLite3 DB not open.`);
    }
  }
}
