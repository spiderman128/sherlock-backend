import fs from 'fs/promises';
import path from 'path';

// This function reads the content of a single file, given its file path, and returns the content as a string. It's useful when you have a specific file and you want to read its content.
export async function readFileContent(filePath) {
    console.log(`\nReading content`);
    const data = await fs.readFile(filePath, 'utf-8');
    return data;
}

// This function reads all files in a given directory (but not its subdirectories) and returns a list of those with a specific file extension. It's useful when you want to list all files of a certain type in a single directory.
export async function getFilesInDirectory(directoryPath, fileType) {
    const files = await fs.readdir(directoryPath);
    const filteredFiles = files.filter(
        (file) => path.extname(file).toLowerCase() === `.${fileType}`
    );
    return filteredFiles;
}

// This function reads all files in a given directory and its subdirectories, regardless of their file extension, and returns a list of their file paths.
export async function getFiles(dir) {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
        dirents.map((dirent) => {
            const res = path.resolve(dir, dirent.name);
            return dirent.isDirectory() ? getFiles(res) : res;
        })
    );
    return Array.prototype.concat(...files);
}

async function isDirectoryEmpty(directoryPath) {
    try {
        const files = fs.readdir(directoryPath);
        return files.length === 0;
    } catch (error) {
        throw error;
    }
}

export async function checkFileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Read all the files in the directory and return the content.
 *
 * @param {string} baseDir - The base directory
 * @param {string} processedBaseDir - The directory to move the files to once they are processed.
 * @param {string} extension - The extension of the files to read.
 * @param {boolean} debug - Whether to print debug information
 * @returns - Array which contains the page content and the ID.
 */
export async function extractPageContentAndMetadata(
    baseDir,
    processedBaseDir,
    extension,
    debug = false
) {
    // Instantiate stores for the two properties we want to extract for each object
    const contents = [];
    const fillersIDs = [];

    // Check if there are files to extract from
    const is_empty = await isDirectoryEmpty(baseDir);

    if (is_empty) {
        console.log('No files to extract from');
        return {
            contents,
            fillersIDs,
        };
    } else {
        let start = performance.now();

        // Load data to build the indexing
        let arrayOfJSONFiles = await getFilesInDirectory(baseDir, extension);

        let jsonContent = [];

        // Process all the new files
        for (const fileName of arrayOfJSONFiles) {
            // Read the contents
            const filePath = path.join(baseDir, fileName);
            const content = await readFileContent(filePath);

            // If not empty
            if (content) {
                // Append new text to the array
                jsonContent = [...jsonContent, ...JSON.parse(content)];

                // Move file to 'processed' folder to indicate it's done
                const destPath = path.join(processedBaseDir, fileName);
                fs.rename(filePath, destPath);
                if (debug) {
                    console.log(`${fileName} File Read & Moved successfully`);
                }
            } else {
                console.log('No Content to extract from');
                if (debug) {
                    console.log(`${fileName} File Read But Not Moved`);
                }
            }
        }

        // Update the index
        jsonContent.forEach((entry) => {
            contents.push(entry.pageContent);
            fillersIDs.push(entry.metadata.fillerID);
        });

        if (debug) {
            console.log(
                `\nProcessing all files from to_process took ${
                    performance.now() - start
                } milliseconds.`
            );
        }

        return {
            contents,
            fillersIDs,
        };
    }
}

export async function createDirectory(s3, bucketName, directoryPath) {
    // Add a trailing slash if necessary
    if (!directoryPath.endsWith('/')) {
        directoryPath += '/';
    }

    await s3
        .putObject({
            Bucket: bucketName,
            Key: directoryPath,
            Body: '',
        })
        .promise();
}
