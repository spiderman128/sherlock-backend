// Import the required libraries
import * as tf from '@tensorflow/tfjs'; // Need this of tfjs-node
import * as tfn from '@tensorflow/tfjs-node'; // Need this to make queries 100x faster
import * as encoder from '@tensorflow-models/universal-sentence-encoder';
import '@tensorflow/tfjs-backend-cpu'; // Import the CPU and WebGL backends to increase performance

/**
 * Load the model from the tensorflow hub.
 * @param {boolean} debug - Whether to print debug information
 *
 * @returns - The model
 */
export async function loadModel(debug = false) {
    const start = performance.now();

    const model = await encoder.load();

    if (debug) {
        console.log(
            `\nModel Loading took ${performance.now() - start} milliseconds.`
        );
    }
    return model;
}

/**
 * Convert the text to an embedding.
 *
 * @param {Object} model - The model to use for the conversion
 * @param {array} texts - The texts to convert
 * @param {boolean} debug - Whether to print debug information
 * @returns - The embedding - a 2D array
 */
export async function convertToEmbedding(model, texts, debug = false) {
    const batch_size = 128;
    let result = [];
    let numIterations = Math.ceil(texts.length / batch_size);

    // Iterate over the array in chunks of 128 elements
    for (let i = 0; i < numIterations; i++) {
        const start = performance.now();
        // Get the current chunk of 128 elements
        let startIndex = i * batch_size;
        let endIndex = Math.min(startIndex + batch_size, texts.length);
        let chunk = texts.slice(startIndex, endIndex);

        const embeddings = await model.embed(chunk);
        const embeddingArray = await embeddings.array();
        result = [...result, ...embeddingArray];
        embeddings.dispose(); // Clean up the memory
        if (debug) {
            console.log(
                `\nEmbedding took ${
                    performance.now() - start
                } milliseconds. shape ${embeddingArray.length}`
            );
        }
    }

    return result;
}
