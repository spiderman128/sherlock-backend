import pkg from 'hnswlib-node'; // Import the HNSW library
const { HierarchicalNSW } = pkg;
import fillerMap from './fillerMap.js';
import path from 'path';
import { convertToEmbedding } from './embedding.js';
import { checkFileExists, extractPageContentAndMetadata } from './ingestion.js';
import QnAModel from '../models/qna.model.js';

const numDimensions = 512; // the length of data point vector that will be indexed.
const maxElements = 100000; // the maximum number of data points.

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
    indexingPath,
    model,
    text,
    nearestNeighbors,
    debug
) {
    // Load the existing index
    const indexing = await loadIndexFromFile(
        indexingPath,
        numDimensions,
        maxElements,
        debug
    );

    let result = await vectorSearch(
        [text],
        model,
        indexing,
        nearestNeighbors,
        debug
    );

    let start = performance.now();

    // Get QnAs for all neighbors
    let qnas = await Promise.all(
        result.neighbors.map(async (neighbor) => {
            return await QnAModel.getQnA(neighbor);
        })
    );

    if (debug) {
        console.log(
            `\nSearching post processing took ${
                performance.now() - start
            } milliseconds (ie. converting embedding ID into fillerText value).`
        );
    }

    // Map the QnAs to the desired output format
    return qnas.map((qna) => ({
        question: qna.question, // closestMatchingQuestion
        answer: qna.answer, // answerToQuestion
    }));
}

export function getContentByKey(arr, key) {
    // Loop through each array element
    for (const element of arr) {
        // Check if the key of the current element matches the given key
        if (element[0] === key) {
            // If a match is found, return the 'fillerID' and 'pageContent'
            return {
                fillerID: element[1].fillerID,
                pageContent: element[1].pageContent,
            };
        }
    }
    // If no match is found, return null
    return null;
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
export function buildIndexing(
    indexingPath,
    numDimensions,
    maxElements,
    debug = false
) {
    const start = performance.now();

    const indexing = new HierarchicalNSW('cosine', numDimensions);
    indexing.initIndex(maxElements);

    indexing.writeIndexSync(indexingPath);

    if (debug) {
        console.log(
            `\nBuilding Index took ${performance.now() - start} milliseconds.`
        );
    }
    return indexing;
}

export async function addToIndex(
    indexingPath,
    model,
    indexName,
    question,
    answer,
    debug
) {
    const start = performance.now();
    // Check if the indexing exists
    const is_existing_index = await checkFileExists(indexingPath);
    let indexing;
    // Load the existing index of create a new one
    if (is_existing_index) {
        console.log(`${indexingPath} Static Index File Exists - Loading File`);
        // Load the existing index
        indexing = await loadIndexFromFile(
            indexingPath,
            numDimensions,
            maxElements,
            debug
        );
    } else {
        console.log(`${indexingPath} No Index File - Building From Scratch`);
        // Build the new indexing
        indexing = await buildIndexing(
            indexingPath,
            numDimensions,
            maxElements,
            debug
        );
    }
    // Convert the text to an embedding.
    const embedding = await convertToEmbedding(model, question, debug);
    const ID = await QnAModel.insert(indexName, question, answer);
    indexing.addPoint(embedding[0], ID);
    indexing.writeIndexSync(indexingPath);

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
export function addBulkToIndex(indexingPath, indexing, embeddings, IDs, debug) {
    const start = performance.now();

    embeddings.forEach((embedding, index) => {
        indexing.addPoint(embedding, IDs[index]);
    });
    indexing.writeIndexSync(indexingPath);

    if (debug) {
        console.log(
            `\nAdd Bulk ${embeddings.length} to index took ${
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
 * Delete the Embeddings to the indexing.
 *
 * @param {string} indexingPath - The path to the indexing being deleted from
 * @param {Object} indexing - The indexing to delete from
 * @param {string} text - The text to search for and delete
 * @param {boolean} debug - Whether to print debug information
 */
export async function deleteFromIndex(indexingPath, text, debug) {
    const start = performance.now();
    try {
        // Load the existing index
        const indexing = await loadIndexFromFile(
            indexingPath,
            numDimensions,
            maxElements,
            debug
        );
        const { qnaId = undefined } = await QnAModel.delete(text);
        if (qnaId) {
            indexing.markDelete(qnaId);
            indexing.writeIndexSync(indexingPath);
        }
        console.log('Embedding Deleted');
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

export async function addEmbeddings(
    model,
    dataProcessingPath,
    dataProcessedPath,
    indexingPath,
    indexName,
    debug
) {
    // Read all the files in the directory and return the content and move the files to the processed folder.
    const extractionResult = await extractPageContentAndMetadata(
        dataProcessingPath,
        dataProcessedPath,
        'json',
        debug
    );

    // Extract valid values and assign empty if not valid
    const { fillersIDs = [], contents = [] } = extractionResult || {};

    // Get the current count
    console.log('Total Text:', contents.length);
    // if there is any content, add it to the indexing
    if (contents.length) {
        const start = performance.now();
        const newIDs = [];
        // Convert the text to an embedding.
        const embeddings = await convertToEmbedding(model, contents, debug);

        for (let i = 0; i < fillersIDs.length; i++) {
            const ID = await QnAModel.insert(
                indexName,
                contents[i],
                fillerMap.get(fillersIDs[i])
            );
            newIDs.push(ID);
        }
        console.log(newIDs);

        // Check if the indexing exists
        const is_existing_index = await checkFileExists(indexingPath);
        let indexing;
        // Load the existing index of create a new one
        if (is_existing_index) {
            console.log(
                `${indexingPath} Static Index File Exists - Loading File`
            );
            // Load the existing index
            indexing = await loadIndexFromFile(
                indexingPath,
                numDimensions,
                maxElements,
                debug
            );
        } else {
            console.log(
                `${indexingPath} No Index File - Building From Scratch`
            );
            // Build the new indexing
            indexing = await buildIndexing(
                indexingPath,
                numDimensions,
                maxElements,
                debug
            );
        }

        addBulkToIndex(indexingPath, indexing, embeddings, newIDs, debug);

        if (debug) {
            console.log(
                `\nIndexing took ${
                    performance.now() - start
                } milliseconds. shape ${embeddings.length}`
            );
        }
    }
}

export function groupBy(key) {
    return (array) =>
        array.reduce((objectsByKeyValue, obj) => {
            const value = obj[key];
            delete obj[key]; // delete that key.
            objectsByKeyValue[value] = (objectsByKeyValue[value] || []).concat(
                obj
            );
            return objectsByKeyValue;
        }, {});
}

export async function addEmbeddingsFromJSON(
    model,
    indexingBasePath,
    defaultIndexing,
    jsonData,
    debug
) {
    const indexNameGroupBy = groupBy('indexName');
    const indexNameGroup = indexNameGroupBy(jsonData);

    for (const [indexName, data] of Object.entries(indexNameGroup)) {
        const question = [],
            answer = [];
        data.forEach((entry) => {
            question.push(entry.question);
            answer.push(entry.answer);
        });
        console.log('Total Text:', question.length);
        // if there is any content, add it to the indexing
        if (question.length) {
            const start = performance.now();
            const newIDs = [];
            const numDimensions = 512; // the length of data point vector that will be indexed.
            const maxElements = 100000; // the maximum number of data points.

            // Convert the text to an embedding.
            const embeddings = await convertToEmbedding(model, question, debug);

            for (let i = 0; i < question.length; i++) {
                const ID = await QnAModel.insert(
                    indexName,
                    question[i],
                    answer[i]
                );
                newIDs.push(ID);
            }
            console.log(newIDs);
            const id = indexName || defaultIndexing;
            const indexingPath = path.join(indexingBasePath, id + '.hnsw');

            // Check if the indexing exists
            const is_existing_index = await checkFileExists(indexingPath);
            let indexing;
            // Load the existing index of create a new one
            if (is_existing_index) {
                console.log(
                    `${indexingPath} Static Index File Exists - Loading File`
                );
                // Load the existing index
                indexing = await loadIndexFromFile(
                    indexingPath,
                    numDimensions,
                    maxElements,
                    debug
                );
            } else {
                console.log(
                    `${indexingPath} No Index File - Building From Scratch`
                );
                // Build the new indexing
                indexing = await buildIndexing(
                    indexingPath,
                    numDimensions,
                    maxElements,
                    debug
                );
            }

            addBulkToIndex(indexingPath, indexing, embeddings, newIDs, debug);

            if (debug) {
                console.log(
                    `\nIndexing took ${
                        performance.now() - start
                    } milliseconds. shape ${embeddings.length}`
                );
            }
        }
    }

    // Get the current count
}
