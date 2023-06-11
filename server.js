import { checkFileExists } from './utils/ingestion.js';
import { loadModel } from './utils/embedding.js';
import {
    addEmbeddings,
    addToIndex,
    addEmbeddingsFromJSON,
    returnMatchedFiller,
    deleteFromIndex,
} from './utils/indexing.js';
import express from 'express';
import path from 'path';
import { s3, saveDataToS3, loadDataFromS3 } from './utils/persistent.js';
import InitDatabase from './models/initDB.model.js';

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());

// ------------------------------------------------------------------------------------------- //
// IMPLEMENT THIS INTO AIRCHAT SO THAT IT ONLY RUNS ONCE (IDEALLY BEFORE THE CALL EVEN STARTS) //
// ------------------------------------------------------------------------------------------- //

const DEBUG = true;
const dataProcessingPath = './data/to_process';
const dataProcessedPath = './data/processed';
const DBBasepath = './data/indexing/';
const indexingBasePath = './data/indexing/';
const defaultIndexing = 'defaultIndex';
const bucketName = 'airchat-persistent-vectorstorage';
const NN = 1; // the number of nearest neighbors to search.
let model;

// ------------------------------------------------------------------------------------------- //
// ** BULK ACTION **: EMBEDD FILES IN THE 'to_process' FOLDER THAT PERTAIN TO A SPECIFIC indexName //
// ------------------------------------------------------------------------------------------- //
// update embeddings
app.post('/search/update', async (req, res) => {
    // Check to make sure indexName is present
    if (!req.body.indexName) {
        res.status(400).send({ error: 'Missing indexName parameter' });
        return;
    }

    const indexName = req.body.indexName;
    const indexingPath = path.join(indexingBasePath, indexName + '.hnsw');
    // Add any embeddings from the to_process folder
    await addEmbeddings(
        model,
        dataProcessingPath,
        dataProcessedPath,
        indexingPath,
        indexName,
        DEBUG
    );

    await saveDataToS3(s3, bucketName, './data/to_process', 'to_process');
    await saveDataToS3(s3, bucketName, './data/processed', 'processed');
    await saveDataToS3(s3, bucketName, './data/indexing', 'indexing');

    res.json({
        message: `${indexingPath} Embeddings Updated`,
    });
});

// --------------------------------------------------------------------- //
// ** SINGLE OBJ ACTION **: ADD EMBEDDING TO SPECIFIC indexName VECTOR STORE //
// --------------------------------------------------------------------- //
app.post('/api/embed', async (req, res) => {
    // Check to make sure indexName is present
    if (!req.body.indexName) {
        res.status(400).send({ error: 'Missing indexName parameter' });
        return;
    }
    // Grab the parameters
    const { question, indexName = defaultIndexing, answer } = req.body;
    const indexingPath = path.join(indexingBasePath, indexName + '.hnsw');

    if (!question || !answer) {
        res.status(400).send({ error: 'Missing question or answer parameter' });
        return;
    }

    // Add the embedding to the indexing
    await addToIndex(indexingPath, model, indexName, question, answer, DEBUG);

    await saveDataToS3(s3, bucketName, './data/indexing', 'indexing').catch(
        (err) => {
            // Do some logging here or handle error
            console.error(`Error saving data to S3: ${err}`);
        }
    );

    res.send({
        message: `Embedding with text '${question}' added to ${indexingPath}`,
    });
});

app.post('/api/json', async (req, res) => {
    // Grab the parameters
    const jsonData = req.body;

    if (!jsonData) {
        res.status(400).send({ error: 'Missing jsonData parameter' });
        return;
    }

    // Add any embeddings grabbed from the to_process folder earlier
    await addEmbeddingsFromJSON(
        model,
        indexingBasePath,
        defaultIndexing,
        jsonData,
        DEBUG
    );

    await saveDataToS3(s3, bucketName, './data/indexing', 'indexing').catch(
        (err) => {
            // Do some logging here or handle error
            console.error(`Error saving data to S3: ${err}`);
        }
    );

    res.send({
        message: `Embeddings added`,
    });
});

// ------------------------------------------------------------------------------------- //
// ** SINGLE OBJ ACTION **: FETCH EMBEDDING MATCHES FROM SPECIFIC indexName VECTOR STORE //
// ------------------------------------------------------------------------------------- //
// Get Matched Filler
app.get('/api/match', async (req, res) => {
    // Grab the parameters
    const { sentence, indexName, neighbors } = req.query;
    console.log(sentence, indexName, neighbors);

    // Check to make sure indexName is present
    if (!indexName) {
        res.status(400).send({ error: 'Missing indexName parameter' });
        return;
    }

    const indexingPath = path.join(indexingBasePath, indexName + '.hnsw');
    const nearestNeighbors = parseInt(neighbors) || NN;
    const is_existing_index = await checkFileExists(indexingPath);

    if (!sentence) {
        res.status(400).send({ error: 'Missing sentence parameter' });
        return;
    }
    if (!is_existing_index) {
        res.status(400).send({ error: 'Indexing does not exist' });
        return;
    }

    const result = await returnMatchedFiller(
        indexingPath,
        model,
        sentence,
        nearestNeighbors,
        DEBUG
    );

    console.log(result);
    res.send(result);
});

// --------------------------------------------------------------------------- //
// ** SINGLE OBJ ACTION **: DELETE EMBEDDINGS FROM SPECIFIC indexName VECTOR STORE //
// --------------------------------------------------------------------------- //
// Delete Embedding
app.delete('/api/delete', async (req, res) => {
    const textToDelete = req.body.question;

    // Check to make sure indexName is present
    if (!req.body.indexName) {
        res.status(400).send({ error: 'Missing indexName parameter' });
        return;
    }
    const indexName = req.body.indexName;

    const indexingPath = path.join(indexingBasePath, indexName + '.hnsw');
    const is_existing_index = await checkFileExists(indexingPath);

    if (!textToDelete) {
        res.status(400).send({ error: 'Missing  text parameter' });
        return;
    }

    if (!is_existing_index) {
        res.status(400).send({ error: 'Indexing does not exist' });
        return;
    }

    await deleteFromIndex(indexingPath, textToDelete, DEBUG);

    res.send({
        success: `Embedding with text '${textToDelete}' deleted from ${indexingPath}`,
    });

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

    await InitDatabase.open(DBBasepath, DEBUG);
    model = await loadModel(DEBUG);
    const indexingPath = path.join(indexingBasePath, defaultIndexing + '.hnsw');

    // Add any embeddings grabbed from the to_process folder earlier
    await addEmbeddings(
        model,
        dataProcessingPath,
        dataProcessedPath,
        indexingPath,
        defaultIndexing,
        DEBUG
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
    InitDatabase.close();

    await saveDataToS3(s3, bucketName, './data/to_process', 'to_process');
    await saveDataToS3(s3, bucketName, './data/processed', 'processed');
    await saveDataToS3(s3, bucketName, './data/indexing', 'indexing');

    console.log('\nData saved to S3. Shutting down...');

    server.close(() => {
        process.exit(0);
    });
});
