const fastify = require("fastify");

const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue, Filter } = require('firebase-admin/firestore');


initializeApp({
  credential: cert(require("./pleadingface-66a7d-e00f9536c168.json"))
});

const db = getFirestore();

const app = fastify();

app.get("/login", async (req, res) => {
  
});


app.listen({port: 3000}).then(() => {
  console.log('Server running at http://localhost:3000/');
});