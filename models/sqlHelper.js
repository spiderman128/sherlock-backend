import sqlite3 from 'sqlite3';
import path from 'path';

/**
 * SQLite3 operations Helper.
 */
export default class SqlHelper {
  /**
   * SQLite Database Object for operations.
   */
  static #sqliteDBHandler;
  /**
   * Standard name for sqlite3 database in application.
   */
  static #nameOfDBFile = 'QA.sqlite3';
  // need to create understanding that if db is removed by outer factor.
  /**
   * Data base accessing mode.
   */
  static #dbModeOfOpening = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE;

  /**
   * Current Status of SQLite DB.
   */
  static isDBOpened = false;

  /**
   * Open SQLite DB with given access mode and path.
   *
   * @param {string} dirOfDB - directory where database created or accessed.
   * @param {boolean} debug - debug mode with default value false.
   * @return {Promise} - promise of opening database.
   */
  static openDB(dirOfDB, debug = false) {
    return new Promise(function(resolve, reject) {
      const absoluteFilePath = path.join(dirOfDB, SqlHelper.#nameOfDBFile);
      SqlHelper.#sqliteDBHandler = new sqlite3.Database(
          absoluteFilePath,
          SqlHelper.#dbModeOfOpening,
          (err) => {
            if (err) {
              reject(
                  new Error(`Unable to 
                Create DB ${absoluteFilePath} [${err}]`),
              );
            }
            if (debug) {
              console.log(`DB:${absoluteFilePath} created successfully!`);
            }
            SqlHelper.isDBOpened = true;
            resolve();
          },
      );
    });
  }

  /**
   * Initialize the SQLite DB with provided statements.
   *
   * @param {string} initSqlStatement - SQL statements to create Database.
   * @param {boolean} debug - debug mode with default value false.
   * @return {Promise} - promise of initializing the database.
   */
  static initializeDB(initSqlStatement, debug = false) {
    return new Promise(function(resolve, reject) {
      SqlHelper.#sqliteDBHandler.exec(initSqlStatement, (err) => {
        if (err) {
          reject(new Error(`Unable to initialize DB [${err}]`));
        }
        if (debug) {
          console.log(`DB: Initialize successfully!`);
        }
        resolve();
      });
    });
  }

  /**
   * Select and Run perticular type of SQL statement on DB.
   *
   * @param {string} typeOfQuery - type of query to be run.
   * @param {string} sqlStatement - parameterized SQL statement.
   * @param {any} sqlStatementParams - params for statment (Array/Object).
   * @param {Function} resolve - Promise resolve function.
   * @param {Function} reject - Promise reject function.
   * @param {boolean} debug - debug mode with default value false.
   */
  static selectQuery(
      typeOfQuery,
      sqlStatement,
      sqlStatementParams,
      resolve,
      reject,
      debug = false,
  ) {
    switch (typeOfQuery) {
      case 'run':
        SqlHelper.#sqliteDBHandler.run(
            sqlStatement,
            sqlStatementParams,
            function(err) {
              if (err) {
                reject(new Error(`Unable to run <run> query [${err}]`));
              }
              if (debug) {
                console.log(`DB: run <run> query successfully completed!`);
              }
              // eslint-disable-next-line no-invalid-this
              resolve(this.lastID);
            },
        );
        break;
      case 'get':
        SqlHelper.#sqliteDBHandler.get(
            sqlStatement,
            sqlStatementParams,
            (err, row) => {
              if (err) {
                reject(new Error(`Unable to run <get> query [${err}]`));
              }
              if (debug) {
                console.log(`DB: run <get> query successfully completed!`);
              }
              resolve(row);
            },
        );
        break;
      case 'all':
        SqlHelper.#sqliteDBHandler.all(
            sqlStatement,
            sqlStatementParams,
            (err, row) => {
              if (err) {
                reject(new Error(`Unable to run <all> query [${err}]`));
              }
              if (debug) {
                console.log(`DB: run <all> query successfully completed!`);
              }
              resolve(row);
            },
        );
        break;
      default:
        reject(new Error(`${typeOfQuery}: no such operation available`));
    }
  }

  /**
   * Run Query of type run,get,all onto DB.
   *
   * @param {string} typeOfQuery - type of query to be perfom.
   * @param {string} sqlStatement - parameterized SQL statement.
   * @param {any} sqlStatementParams - params for statment (Array/Object).
   * @param {boolean} debug - debug mode with default value false.
   * @return  {Promise} - promise of initializing the database.
   */
  static runQueryOnDB(
      typeOfQuery,
      sqlStatement,
      sqlStatementParams,
      debug = false,
  ) {
    return new Promise(function(resolve, reject) {
      SqlHelper.selectQuery(
          typeOfQuery,
          sqlStatement,
          sqlStatementParams,
          resolve,
          reject,
          debug,
      );
    });
  }

  /**
   * Run Transaction of type run,get,all onto DB.
   * with transaction as serial but query as parallel.
   *
   * @param {string} typeOfQuery - type of query to be perfom.
   * @param {string} sqlStatement - parameterized SQL statement.
   * @param {any} sqlStatementParams - params for statment (Array/Object)..
   * @param {boolean} debug - debug mode with default value false.
   * @return  {Promise} - promise of transaction.
   */
  static runTransactionOnDB(
      typeOfQuery,
      sqlStatement,
      sqlStatementParams,
      debug = false,
  ) {
    return new Promise(function(resolve, reject) {
      SqlHelper.#sqliteDBHandler.serialize(() => {
        SqlHelper.#sqliteDBHandler.run(`BEGIN TRANSACTION;`, [], () => {
          SqlHelper.selectQuery(
              typeOfQuery,
              sqlStatement,
              sqlStatementParams,
              resolve,
              reject,
              debug,
          );
        });
        SqlHelper.#sqliteDBHandler.run(`COMMIT`);
      });
    });
  }

  /**
   * Close DB with SQL Handle.
   */
  static async closeDB() {
    SqlHelper.isDBOpened = false;
    SqlHelper.#sqliteDBHandler.close();
  }
}