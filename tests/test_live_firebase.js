const https = require('https');

const firebaseUrl = 'https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app/atmosphere/tables/test_connection.json';
const testData = JSON.stringify({
  status: "verified",
  timestamp: Date.now(),
  message: "Атмосфера Poker Live Sync Ready"
});

const req = https.request(firebaseUrl, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(testData)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('⚡ Тест записи в Firebase Realtime DB:');
    console.log('   Статус код:', res.statusCode);
    console.log('   Ответ базы:', data);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('✅ База Firebase полностью доступна и готова к работе!');
    } else {
      console.error('❌ Ошибка записи в Firebase:', data);
    }
  });
});

req.on('error', err => console.error('Ошибка сети:', err.message));
req.write(testData);
req.end();
