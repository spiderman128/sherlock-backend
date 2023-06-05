import { checkFileExists } from './utils/ingestion.js';
import { loadModel } from './utils/embedding.js';
import {
    loadIndexFromFile,
    buildIndexing,
    addEmbeddings,
    returnMatchedFiller,
    deleteFromIndex,
} from './utils/indexing.js';
import express from 'express';
import { s3, saveDataToS3, loadDataFromS3 } from './utils/persistent.js';

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());

// ------------------------------------------------------------------------------------------- //
// IMPLEMENT THIS INTO AIRCHAT SO THAT IT ONLY RUNS ONCE (IDEALLY BEFORE THE CALL EVEN STARTS) //
// ------------------------------------------------------------------------------------------- //

const DEBUG = true;
const numDimensions = 512; // the length of data point vector that will be indexed.
const maxElements = 100000; // the maximum number of data points.
const dataProcessingPath = './data/to_process';
const dataProcessedPath = './data/processed';
const indexingPath = './data/indexing/vectorIndex.hnsw';
const bucketName = 'airchat-persistent-vectorstorage';
const NN = 1; // the number of nearest neighbors to search.
let indexing, model, contentsMapPath;

// ------------------------------------------------------------------------------------------- //
// ** BULK ACTION **: EMBEDD FILES IN THE "to_process" FOLDER THAT PERTAIN TO A SPECIFIC ORGID //
// ------------------------------------------------------------------------------------------- //
// update embeddings
app.post('/search/update', async (req, res) => {
    // Add any embeddings from the to_process folder
    contentsMapPath = './data/indexing/contentsMap.json';
    await addEmbeddings(
        model,
        dataProcessingPath,
        dataProcessedPath,
        indexingPath,
        indexing,
        DEBUG,
        contentsMapPath
    );

    await saveDataToS3(s3, bucketName, './data/to_process', 'to_process');
    await saveDataToS3(s3, bucketName, './data/processed', 'processed');
    await saveDataToS3(s3, bucketName, './data/indexing', 'indexing');

    res.json({
        message: 'Embeddings Updated',
    });
});

// --------------------------------------------------------------------- //
// ** SINGLE OBJ ACTION **: ADD EMBEDDING TO SPECIFIC ORGID VECTOR STORE //
// --------------------------------------------------------------------- //
// Pass a single JSON object {questionText: " ", answerText: " ", orgId: " "} to be embedded
// questionText = the text to be embedded
// answerText = the text to be returned when it's corresonding 'questionText' is the most similar match on fetchEmbeddings(userQuestion, orgId) calls
// ordID = the unique identifier for selecting the right .hnsw file to add the embedded text to
app.post('/api/embed', async (req, res) => {
    // Add
    // Code
    // Here
});

// --------------------------------------------------------------------------------- //
// ** SINGLE OBJ ACTION **: FETCH EMBEDDING MATCHES FROM SPECIFIC ORGID VECTOR STORE //
// --------------------------------------------------------------------------------- //
// Get Matched Filler
app.get('/api/match', async (req, res) => {
    // Grab the paramaters
    const sentence = req.query.sentence;
    const nearestNeighbors = parseInt(req.query.neighbors) || NN;

    const includeContent = req.query.includecontent || undefined;
    if (!sentence) {
        res.status(400).send({ error: 'Missing sentence parameter' });
        return;
    }
    if (includeContent) {
        contentsMapPath = './data/indexing/contentsMap.json';
    }
    const results = await returnMatchedFiller(
        indexing,
        model,
        sentence,
        nearestNeighbors,
        DEBUG,
        contentsMapPath // This is optional Search post processing to append the contents text to the matched embeddings
    );
    contentsMapPath = undefined;
    res.send({
        fillerTexts: results.fillers,
        pageContents: results.pageContents,
    });
});

// --------------------------------------------------------------------------- //
// ** SINGLE OBJ ACTION **: DELETE EMBEDDINGS FROM SPECIFIC ORGID VECTOR STORE //
// --------------------------------------------------------------------------- //
// Delete Embedding
app.delete('/api/delete/:param', async (req, res) => {
    const paramToDelete = req.params.param;
    let idToDelete;
    let textToDelete;

    // Check if the parameter is numeric or text
    if (!isNaN(parseInt(paramToDelete))) {
        idToDelete = parseInt(paramToDelete);
    } else {
        textToDelete = paramToDelete;
    }

    if (!idToDelete && !textToDelete) {
        res.status(400).send({ error: 'Missing id or text parameter' });
        return;
    }

    deleteFromIndex(indexingPath, indexing, idToDelete, textToDelete, DEBUG);

    if (idToDelete) {
        res.send({ success: `Embedding with id ${idToDelete} deleted.` });
    } else {
        res.send({ success: `Embedding with text "${textToDelete}" deleted.` });
    }

    await saveDataToS3(s3, bucketName, './data/indexing', 'indexing').catch(
        (err) => {
            // Do some logging here or handle error
            console.error(`Error saving data to S3: ${err}`);
        }
    );
});

// ----------------------------------------------------------------- //
// ** BULK ACTION **: MANUALLY SAVE EMBEDDINGS FROM THE VECTOR STORE //
// ----------------------------------------------------------------- //
app.post('/api/save', async (req, res) => {
    try {
        console.log('SAVE DATA TO S3 BUCKET');
        await saveDataToS3(s3, bucketName, './data/to_process', 'to_process');
        await saveDataToS3(s3, bucketName, './data/processed', 'processed');
        await saveDataToS3(s3, bucketName, './data/indexing', 'indexing');
        res.json({
            message: 'Data Saved to S3',
        });
    } catch (error) {
        console.error('Failed to save data to S3:', error);
        res.status(500).json({
            message: 'Failed to save data to S3',
            error: error.message,
        });
    }
});

// ------------------ //
// ** SERVER START ** //
// ------------------ //
// Start the server
const server = app.listen(port, async () => {
    // --------------------------------------------------------------- //
    // LOAD EMBEDDINGS FROM THE ClOUD VECTOR STORE UPON SERVER STARTUP //
    // --------------------------------------------------------------- //
    console.log('LOAD DATA FROM S3 BUCKET');
    await loadDataFromS3(s3, bucketName, 'to_process', './data/to_process');
    await loadDataFromS3(s3, bucketName, 'processed', './data/processed');
    await loadDataFromS3(s3, bucketName, 'indexing', './data/indexing');
    console.log('\n\nLOADED DATA FROM S3 + REMOVED UNRECOGNIZED LOCAL DATA\n');

    // ------------------------------------------------------------- //
    // ACT ON THE LOCAL DATA THAT JUST GOT UPDATED BY loadDataFromS3 //
    // ------------------------------------------------------------- //

    model = await loadModel(DEBUG);

    // Check if the indexing exists
    const is_existing_index = await checkFileExists(indexingPath);

    // Load the existing index of create a new one
    if (is_existing_index) {
        console.log('Static Index File Exists - Loading File');
        // Load the existing index
        indexing = await loadIndexFromFile(
            indexingPath,
            numDimensions,
            maxElements,
            DEBUG
        );
    } else {
        console.log('No Index File - Building From Scratch');
        // Build the new indexing
        indexing = await buildIndexing(
            indexingPath,
            numDimensions,
            maxElements,
            DEBUG
        );
    }

    // Add any embeddings grabbed from the to_process folder earlier
    contentsMapPath = './data/indexing/contentsMap.json';
    await addEmbeddings(
        model,
        dataProcessingPath,
        dataProcessedPath,
        indexingPath,
        indexing,
        DEBUG,
        contentsMapPath
    );

    await saveDataToS3(s3, bucketName, './data/to_process', 'to_process');
    await saveDataToS3(s3, bucketName, './data/processed', 'processed');
    await saveDataToS3(s3, bucketName, './data/indexing', 'indexing');

    console.log(
        `\n----------\nSERVER READY:\n----------\nServer listening on port ${port}\n`
    );
});

// ----------------------------------------------------------- //
// ** SERVER ACTION **: ON SERVER SHUTDOWN, PUSH CHANGES TO S3 //
// ----------------------------------------------------------- //

process.on('SIGINT', async () => {
    console.log('\nProcess is about to exit. Saving data to S3...');

    await saveDataToS3(s3, bucketName, './data/to_process', 'to_process');
    await saveDataToS3(s3, bucketName, './data/processed', 'processed');
    await saveDataToS3(s3, bucketName, './data/indexing', 'indexing');

    console.log('\nData saved to S3. Shutting down...');

    server.close(() => {
        process.exit(0);
    });
});
