import S3 from 'aws-sdk/clients/s3.js';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { getFiles } from './ingestion.js';

export const s3 = new S3({
    endpoint: `https://${process.env.accountid}.r2.cloudflarestorage.com`,
    accessKeyId: `${process.env.access_key_id}`,
    secretAccessKey: `${process.env.access_key_secret}`,
    signatureVersion: 'v4',
});

async function checksum(filePath) {
    const hash = crypto.createHash('md5');
    const data = await fs.readFile(filePath);
    hash.update(data);
    return hash.digest('hex');
}

export async function saveDataToS3(s3, bucketName, localPath, s3Path) {
    // Get all local files in the directory and its subdirectories
    const localFiles = await getFiles(localPath);

    if (!Array.isArray(localFiles)) {
        console.error(`Unable to read local files from ${localPath}`);
        return;
    }

    const data = await s3
        .listObjectsV2({
            Bucket: bucketName,
            Prefix: s3Path,
        })
        .promise();

    // Create a Set of all S3 file keys for easier lookup
    const s3Files = new Set(data.Contents.map((object) => object.Key));

    for (const localFile of localFiles) {
        const s3File = path.join(s3Path, path.relative(localPath, localFile));

        // If S3 file is not in local files, delete it
        if (!s3Files.has(s3File)) {
            await s3
                .deleteObject({ Bucket: bucketName, Key: s3File })
                .promise();
            continue;
        }

        const fileData = await fs.readFile(localFile);
        const fileChecksum = await checksum(localFile);

        try {
            const objectData = await s3
                .headObject({
                    Bucket: bucketName,
                    Key: s3File,
                })
                .promise();

            if (objectData.Metadata.checksum !== fileChecksum) {
                // Checksums don't match, upload the file
                await s3
                    .putObject({
                        Bucket: bucketName,
                        Key: s3File,
                        Body: fileData,
                        Metadata: { checksum: fileChecksum },
                    })
                    .promise();
            }
        } catch (err) {
            if (err.code === 'NotFound') {
                // The file doesn't exist in S3, upload it
                await s3
                    .putObject({
                        Bucket: bucketName,
                        Key: s3File,
                        Body: fileData,
                        Metadata: { checksum: fileChecksum },
                    })
                    .promise();
            } else {
                console.error(err);
            }
        }
    }
}

export async function loadDataFromS3(s3, bucketName, s3Path, localPath) {
    const data = await s3
        .listObjectsV2({
            Bucket: bucketName,
            Prefix: s3Path,
        })
        .promise();

    // Create a Set of all S3 file keys for easier lookup
    const s3Files = new Set(data.Contents.map((object) => object.Key));

    // Get all local files in the directory and its subdirectories
    const localFiles = await getFiles(localPath);

    if (!Array.isArray(localFiles)) {
        console.error(`Unable to read local files from ${localPath}`);
        return;
    }

    for (const localFile of localFiles) {
        const s3File = path.join(s3Path, path.relative(localPath, localFile));
        if (!s3Files.has(s3File)) {
            // If local file is not in S3, delete it
            await fs.unlink(localFile);
            continue;
        }

        const objectData = await s3
            .headObject({
                Bucket: bucketName,
                Key: s3File,
            })
            .promise();

        // Check if local file exists and compare checksums
        const stats = await fs.stat(localFile);
        if (stats.isFile()) {
            const localChecksum = await checksum(localFile);
            const s3Checksum = objectData.Metadata.checksum;

            if (localChecksum !== s3Checksum) {
                // Download new or changed file from S3
                const objectData = await s3
                    .getObject({
                        Bucket: bucketName,
                        Key: s3File,
                    })
                    .promise();

                await fs.writeFile(localFile, objectData.Body);
            }
        }
    }
}

// -------------------------------------------------------//
// TEST THE CLOUDFLARE CONNECTION AND GET PRESIGNED LINKS //
// ------------------------------------------------------ //

// console.log(await s3.listBuckets().promise());

// console.log(
//     await s3
//         .listObjects({ Bucket: 'airchat-persistent-vectorstorage' })
//         .promise()
// );

// // Use the expires property to determine how long the presigned link is valid.
// console.log(
//     await s3.getSignedUrlPromise('getObject', {
//         Bucket: 'airchat-persistent-vectorstorage',
//         Key: 'contentsMap.json',
//         Expires: 3600,
//     })
// );
// // https://my-bucket-name.<accountid>.r2.cloudflarestorage.com/dog.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=<credential>&X-Amz-Date=<timestamp>&X-Amz-Expires=3600&X-Amz-Signature=<signature>&X-Amz-SignedHeaders=host

// // You can also create links for operations such as putObject to allow temporary write access to a specific key.
// console.log(
//     await s3.getSignedUrlPromise('putObject', {
//         Bucket: 'airchat-persistent-vectorstorage',
//         Key: 'vectorIndex.hnsw',
//         Expires: 3600,
//     })
// );
