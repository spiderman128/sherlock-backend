import S3 from 'aws-sdk/clients/s3.js';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

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
    // Check if localPath is a directory
    const stats = await fs.stat(localPath);
    if (stats.isDirectory()) {
        const files = await fs.readdir(localPath);
        for (const file of files) {
            const filePath = path.join(localPath, file);
            const s3Key = `${s3Path}/${file}`;

            // Check if file exists in S3 and compare checksums
            try {
                const objectData = await s3
                    .headObject({
                        Bucket: bucketName,
                        Key: s3Key,
                    })
                    .promise();

                const localChecksum = await checksum(filePath);
                const s3Checksum = objectData.Metadata.checksum;

                if (localChecksum !== s3Checksum) {
                    // Upload new or changed file to S3
                    const fileData = await fs.readFile(filePath);
                    await s3
                        .putObject({
                            Bucket: bucketName,
                            Key: s3Key,
                            Body: fileData,
                            Metadata: {
                                checksum: localChecksum,
                            },
                        })
                        .promise();
                }
            } catch (err) {
                if (err.code === 'NotFound') {
                    // File does not exist in S3, upload it
                    const fileData = await fs.readFile(filePath);
                    await s3
                        .putObject({
                            Bucket: bucketName,
                            Key: s3Key,
                            Body: fileData,
                            Metadata: {
                                checksum: await checksum(filePath),
                            },
                        })
                        .promise();
                } else {
                    console.error(err);
                }
            }
        }
    } else {
        // localPath is a file, upload it to S3
        const data = await fs.readFile(localPath);
        await s3
            .putObject({
                Bucket: bucketName,
                Key: s3Path,
                Body: data,
            })
            .promise();
    }
}

async function loadDataFromS3(s3, bucketName, s3Path, localPath) {
    const data = await s3
        .listObjectsV2({
            Bucket: bucketName,
            Prefix: s3Path,
        })
        .promise();

    for (const object of data.Contents) {
        const filePath = path.join(localPath, path.basename(object.Key));

        try {
            const objectData = await s3
                .headObject({
                    Bucket: bucketName,
                    Key: object.Key,
                })
                .promise();

            // Check if local file exists and compare checksums
            try {
                const stats = await fs.stat(filePath);
                if (stats.isFile()) {
                    const localChecksum = await checksum(filePath);
                    const s3Checksum = objectData.Metadata.checksum;

                    if (localChecksum !== s3Checksum) {
                        // Download new or changed file from S3
                        const objectData = await s3
                            .getObject({
                                Bucket: bucketName,
                                Key: object.Key,
                            })
                            .promise();

                        await fs.writeFile(filePath, objectData.Body);
                    }
                }
            } catch (err) {
                if (err.code === 'ENOENT') {
                    // Local file does not exist, download it from S3
                    const objectData = await s3
                        .getObject({
                            Bucket: bucketName,
                            Key: object.Key,
                        })
                        .promise();

                    await fs.mkdir(path.dirname(filePath), { recursive: true });
                    await fs.writeFile(filePath, objectData.Body);
                } else {
                    console.error(err);
                }
            }
        } catch (err) {
            console.error(err);
        }
    }
}

// -------------------------------------------------------//
// TEST THE CLOUDFLARE CONNECTION AND GET PRESIGNED LINKS //
// ------------------------------------------------------ //

console.log(await s3.listBuckets().promise());

console.log(
    await s3
        .listObjects({ Bucket: 'airchat-persistent-vectorstorage' })
        .promise()
);

// Use the expires property to determine how long the presigned link is valid.
console.log(
    await s3.getSignedUrlPromise('getObject', {
        Bucket: 'airchat-persistent-vectorstorage',
        Key: 'contentsMap.json',
        Expires: 3600,
    })
);
// https://my-bucket-name.<accountid>.r2.cloudflarestorage.com/dog.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=<credential>&X-Amz-Date=<timestamp>&X-Amz-Expires=3600&X-Amz-Signature=<signature>&X-Amz-SignedHeaders=host

// You can also create links for operations such as putObject to allow temporary write access to a specific key.
console.log(
    await s3.getSignedUrlPromise('putObject', {
        Bucket: 'airchat-persistent-vectorstorage',
        Key: 'vectorIndex.hnsw',
        Expires: 3600,
    })
);
