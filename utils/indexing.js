import pkg from 'hnswlib-node'; // Import the HNSW library
const { HierarchicalNSW } = pkg;
import fillerMap from './fillerMap.js';
import { convertToEmbedding } from './embedding.js';
import { checkFileExists } from './ingestion.js';
import fs from 'fs/promises';
import { extractPageContentAndMetadata } from './ingestion.js';

/**
 * Search the sentence in the indexing and return the nearest neighbors.
 *
 * @param {string} sentences - The sentence to search in a list of sentences
 * @param {Object} model - The model to use for the conversion
 * @param {Object} indexing - The indexing to use for the search
 * @param {number} nearestNeighbors - The number of nearest neighbors to return
 * @param {boolean} debug - Whether to print debug information
 * @returns - The nearest neighbors which contains distances and IDs with the embedding.
 */
export async function vectorSearch(
    sentences,
    model,
    indexing,
    nearestNeighbors,
    debug = false
) {
    // Convert the sentence to an embedding.
    const queryVector = await convertToEmbedding(model, sentences, debug);

    const start = performance.now();

    const result = indexing.searchKnn(queryVector[0], nearestNeighbors);
    if (debug) {
        console.log(`\nSearch took ${performance.now() - start} milliseconds.`);
    }

    return { ...result, embedding: queryVector[0] };
}

/**
 * Return the matched filler.
 *
 * @param {Object} indexing - The indexing to use for the search
 * @param {Object} model - The model to use for the conversion
 * @param {string} text - The text to search
 * @param {number} nearestNeighbors - The number of nearest neighbors to return
 * @param {boolean} debug - Whether to print debug information
 * @returns - The matched filler
 */
export async function returnMatchedFiller(
    indexing,
    model,
    text,
    nearestNeighbors,
    debug,
    contentsMapPath
) {
    let result = await vectorSearch(
        [text],
        model,
        indexing,
        nearestNeighbors,
        debug
    );

    let start = performance.now();

    const fillers = result.neighbors.map((id) => {
        return fillerMap.get(getFillerID(id));
    });

    let pageContents = [];
    if (contentsMapPath) {
        const contentsMap = new Map(
            JSON.parse(await fs.readFile(contentsMapPath, 'utf-8'))
        );

        pageContents = result.neighbors.map((id) => {
            return contentsMap.get(getCounterID(id));
        });
        console.log('');
        console.log(pageContents);
    }

    if (debug) {
        console.log(
            `\nSearching post processing took ${
                performance.now() - start
            } milliseconds (ie. converting embedding ID into fillerText value).`
        );
    }
    return { ...result, fillers, pageContents };
}

/**
 * Build the indexing.
 *
 * @param {string} path - The path to save the indexing
 * @param {number} numDimensions - The number of dimensions
 * @param {number} maxElements - The maximum number of elements
 * @param {boolean} debug - Whether to print debug information
 * @returns - The indexing
 */
export function buildIndexing(path, numDimensions, maxElements, debug = false) {
    const start = performance.now();

    const indexing = new HierarchicalNSW('cosine', numDimensions);
    indexing.initIndex(maxElements);

    indexing.writeIndexSync(path);

    if (debug) {
        console.log(
            `\nBuilding Index took ${performance.now() - start} milliseconds.`
        );
    }
    return indexing;
}

/**
 * Add the Embeddings to the indexing.
 *
 * @param {string} path - The path to save the indexing.
 * @param {Object} indexing - The indexing to add the point to
 * @param {array} embedding - The embedding to add
 * @param {number} ID - The ID to add
 * @param {boolean} debug - Whether to print debug information
 */
export function addToIndex(path, indexing, embedding, ID, debug) {
    const start = performance.now();

    indexing.addPoint(embedding, ID);
    indexing.writeIndexSync(path);

    if (debug) {
        console.log(
            `\nAdd to index took ${performance.now() - start} milliseconds.`
        );
    }
}

/**
 * Add the Bulks Embeddings to the indexing.
 *
 * @param {string} path - The path to save the indexing.
 * @param {Object} indexing - The indexing to add the point to
 * @param {array} embedding - The embedding to add
 * @param {number} ID - The ID to add
 * @param {boolean} debug - Whether to print debug information
 */
export function addBulkToIndex(path, indexing, embeddings, IDs, debug) {
    const start = performance.now();

    embeddings.forEach((embedding, index) => {
        indexing.addPoint(embedding, IDs[index]);
    });
    indexing.writeIndexSync(path);

    if (debug) {
        console.log(
            `\nAdd Bulk ${embeddings.length} to index took ${
                performance.now() - start
            } milliseconds.`
        );
    }
}

/**
 * Add the contentIDs & contentText to a static file
 *
 * @param {string} path - The path to save the indexing.
 * @param {array} newContentIDs - The array of objects to add
 * @param {boolean} debug - Whether to print debug information
 */
export async function addBulkToContentsIndex(path, newContentIDs, debug) {
    try {
        const start = performance.now();
        let contentMap = new Map();

        if (await checkFileExists(path)) {
            const existingData = await fs.readFile(path, 'utf-8');
            const existingMap = new Map(JSON.parse(existingData));
            newContentIDs.forEach(([key, value]) =>
                existingMap.set(key, value)
            );
            contentMap = existingMap;
            console.log('Successfully updated Map.');
        } else {
            newContentIDs.forEach(([key, value]) => contentMap.set(key, value));
            console.log('Successfully created Map.');
        }

        await fs.writeFile(
            path,
            JSON.stringify(Array.from(contentMap.entries()), null, 2)
        );

        if (debug) {
            console.log(
                `\nAdd Bulk ${newContentIDs.length} to contentIDs file took ${
                    performance.now() - start
                } milliseconds.`
            );
        }
    } catch (error) {
        console.log('Error:', error);
    }
}

/**
 * Delete the Embeddings to the indexing.
 *
 * @param {string} path - The path to save the indexing.
 * @param {Object} indexing - The indexing to add the point to
 * @param {number} ID - The ID to add
 * @param {boolean} debug - Whether to print debug information
 */
export function deleteFromIndex(path, indexing, ID, debug) {
    const start = performance.now();
    try {
        indexing.markDelete(ID);
        indexing.writeIndexSync(path);
    } catch (e) {
        console.log(e);
    }

    if (debug) {
        console.log(
            `\nDelete from index took ${
                performance.now() - start
            } milliseconds.`
        );
    }
}

/**
 * Build the indexing.
 *
 * @param {string} path - The number of dimensions
 * @param {number} numDimensions - The number of dimensions
 * @param {number} maxElements - The maximum number of elements
 * @param {boolean} debug - Whether to print debug information
 * @returns - The indexing
 */
export async function loadIndexFromFile(
    path,
    numDimensions,
    maxElements,
    debug = false
) {
    const start = performance.now();

    // Load index data from file
    const indexing = new HierarchicalNSW('cosine', numDimensions);
    indexing.readIndexSync(path, true);
    indexing.resizeIndex(maxElements);
    if (debug) {
        console.log(
            `\nLoading Index took ${performance.now() - start} milliseconds.`
        );
    }

    return indexing;
}

/**
 * Create an ID for each page.
 *
 * @param {number} index - The index of the page
 * @param {number} fillerID - The filler ID
 * @returns - The ID
 */
export function createID(counterID, fillerID) {
    const id = counterID * 100 + fillerID;
    return id;
}

/**
 * Get the filler ID from the ID.
 *
 * @param {number} id - The ID
 * @returns - The filler ID
 */
export function getFillerID(id) {
    return id % 100;
}

/**
 * Get the counter ID from the ID.
 *
 * @param {number} id - The ID
 * @returns - The counter ID
 */
export function getCounterID(id) {
    return Math.floor(id / 100);
}

/**
 * Add the Bulks Embeddings to the indexing.
 *
 * @param {Object} model - The model to use for the conversion
 * @param {string} indexingPath - The path to load the indexing from or save a new one to.
 * @param {Object} indexing - The indexing to add the point to
 * @param {Array} contents - The array of extracted pageContent values
 * @param {Array} fillersIDs - The array of extracted fillerIDs values
 * @param {string} debug - Whether to print debug information
 */
export async function addEmbeddings(
    model,
    dataProcessingPath,
    dataProcessedPath,
    indexingPath,
    indexing,
    DEBUG,
    contentsMapPath
) {
    // Read all the files in the directory and return the content and move the files to the processed folder.
    const extractionResult = await extractPageContentAndMetadata(
        dataProcessingPath,
        dataProcessedPath,
        'json',
        DEBUG
    );

    // Extract valid values and assign empty if not valid
    const { fillersIDs = [], contents = [] } = extractionResult || {};

    // Get the current count
    let counterID = indexing.getCurrentCount();

    console.log('Total Text:', contents.length);
    // if there is any content, add it to the indexing
    if (contents.length) {
        const start = performance.now();
        const newContentIDs = [];
        const newIDs = [];

        // Convert the text to an embedding.
        const embeddings = await convertToEmbedding(model, contents, DEBUG);

        // Add the embedding to the indexing and append to the contentsMap
        for (let i = 0; i < fillersIDs.length; i++) {
            counterID += 1;
            newContentIDs.push([counterID, contents[i]]);
            newIDs.push(createID(counterID, fillersIDs[i]));
        }
        console.log(newIDs);

        await addBulkToContentsIndex(contentsMapPath, newContentIDs, DEBUG);
        addBulkToIndex(indexingPath, indexing, embeddings, newIDs, DEBUG);

        if (DEBUG) {
            console.log(
                `\nIndexing took ${
                    performance.now() - start
                } milliseconds. shape ${embeddings.length}`
            );
        }
    }
}
