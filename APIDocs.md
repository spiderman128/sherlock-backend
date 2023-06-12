SINGLE OBJECT ACTIONS

endpoint : http://localhost:3000/api/embed
type : POST
json : { "question": "Where is my order?", "answer": "Your food is on the way. It will be delivered by 5pm today." indexName:20 }
purpose : Used to add a new question and answer to the search index for a given indexName.

endpoint : http://localhost:3000/api/delete
type : DELETE
json : { "indexName":20, "question": "Where is my order?" }
purpose : Used to delete a question from the search index for a given indexName.

endpoint : http://localhost:3000/api/match
type : GET
json : { "sentence": "Where is my order?", indexName: 20}
purpose : Used to search the best match for a given sentence from the search index for a given indexName and then and return a question+answer pair.

BULK ACTIONS

endpoint : http://localhost:3000/api/json
type : POST
json : [{ "question": "Where is my order?", "answer": "Your food is on the way. It will be delivered by 5pm today." indexName:20 },{ "question": "Where is job?", "answer": "your job is waiting for you." indexName:21 },{ "question": "Where is my food?", "answer": "Your food is in the kitchen." indexName:20 },{ "question": "Where is my Key?", "answer": "Your food is in the bedroom." indexName:21 }]
purpose : Used to add a new questions and answers to the search index for a given indexName. can add multiple questions and answers at once with different indexName.

endpoint : http://localhost:3000/search/update
type : POST
json : { "indexName":20 }
purpose : Used to update the search index for a given indexName with the JSON file in the 'to_process' folder pulled in from S3 bucket
