
endpoint : http://localhost:3000/search/update 
type : POST
json : { "orgId":20 }
purpose : Used to update the search index for a given orgId if orgId is not present it will update default search index. 

endpoint : http://localhost:3000/api/embed 
type : POST
json : { "question": "Where is my order?", "answer": "Your food is on the way. It will be delivered by 5pm today." orgId:20 }
purpose : Used to add a new question and answer to the search index for a given orgId if orgId is not present it will update default search index.

endpoint : http://localhost:3000/api/json
type : POST
json : [{ "question": "Where is my order?", "answer": "Your food is on the way. It will be delivered by 5pm today." orgId:20 },{ "question": "Where is job?", "answer": "your job is waiting for you." orgId:21 },{ "question": "Where is my food?", "answer": "Your food is in the kitchen." orgId:20 },{ "question": "Where is my Key?", "answer": "Your food is in the bedroom." orgId:21 }]
purpose : Used to add a new questions and answers to the search index for a given orgId if orgId is not present it will update default search index. can add multiple questions and answers at once with different orgId.

endpoint : http://localhost:3000/api/delete
type : DELETE
json : { "orgId":20, "question": "Where is my order?" }
purpose : Used to delete a question from the search index for a given orgId if orgId is not present it will update default search index.


endpoint : http://localhost:3000/api/match
type : GET
json : { "sentence": "Where is my order?" }
purpose : Used to get the best match for a given sentence and it's answer from the search index for a given orgId if orgId is not present it will update default search index.
