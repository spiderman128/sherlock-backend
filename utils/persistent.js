import S3 from 'aws-sdk/clients/s3.js';

export const s3 = new S3({
    endpoint: `https://${process.env.accountid}.r2.cloudflarestorage.com`,
    accessKeyId: `${process.env.access_key_id}`,
    secretAccessKey: `${process.env.access_key_secret}`,
    signatureVersion: 'v4',
});

console.log(await s3.listBuckets().promise());
//=> {
//=>   Buckets: [
//=>     { Name: 'user-uploads', CreationDate: 2022-04-13T21:23:47.102Z },
//=>     { Name: 'my-bucket-name', CreationDate: 2022-05-07T02:46:49.218Z }
//=>   ],
//=>   Owner: {
//=>     DisplayName: '...',
//=>     ID: '...'
//=>   }
//=> }

console.log(
    await s3
        .listObjects({ Bucket: 'airchat-persistent-vectorstorage' })
        .promise()
);
//=> {
//=>   IsTruncated: false,
//=>   Name: 'my-bucket-name',
//=>   CommonPrefixes: [],
//=>   MaxKeys: 1000,
//=>   Contents: [
//=>     {
//=>       Key: 'cat.png',
//=>       LastModified: 2022-05-07T02:50:45.616Z,
//=>       ETag: '"c4da329b38467509049e615c11b0c48a"',
//=>       ChecksumAlgorithm: [],
//=>       Size: 751832,
//=>       Owner: [Object]
//=>     },
//=>     {
//=>       Key: 'todos.txt',
//=>       LastModified: 2022-05-07T21:37:17.150Z,
//=>       ETag: '"29d911f495d1ba7cb3a4d7d15e63236a"',
//=>       ChecksumAlgorithm: [],
//=>       Size: 279,
//=>       Owner: [Object]
//=>     }
//=>   ]
//=> }

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
