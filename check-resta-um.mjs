import mongoose from 'mongoose';

const uri = process.env.MONGO_URI;
await mongoose.connect(uri);

const collection = mongoose.connection.collection('restaumcaches');
const docs = await collection.find({}).limit(3).toArray();

if (docs.length === 0) {
    console.log('❌ Nenhuma edição RestaUm encontrada');
} else {
    console.log('✅ Edições RestaUm encontradas:');
    docs.forEach(doc => {
        console.log(`  - Liga: ${doc.liga_id}, Edição: ${doc.edicao}, Status: ${doc.status}`);
    });
}
process.exit(0);
