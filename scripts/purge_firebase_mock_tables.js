/**
 * MAINTENANCE SCRIPT: Purge Zombie / Mock Tables from Firebase Realtime Database
 * Антикафе «Атмосфера»
 */

const https = require("https");

const FIREBASE_BASE_URL = "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app";

const ZOMBIE_TABLES = [
  "dealer_drugoe",
  "dealer_evgeniy",
  "dealer_igor",
  "dealer_sergey",
  "dealer_ведущий"
];

const VALID_DEALERS_REGISTRY = {
  LIST: ["Арина", "Арташес", "Влад", "Всеволод", "Дима", "Маша", "Нинель", "Паша", "Рома", "Саша", "Тимур", "Эмилия"],
  MAP: {
    "arina_makk": "Арина",
    "arbuzmane": "Арташес",
    "h0raiz0n": "Влад",
    "dsh838": "Всеволод",
    "sntrpe": "Дима",
    "starynskaya": "Маша",
    "ninel_mr": "Нинель",
    "trick_str": "Паша",
    "klimovichroman": "Рома",
    "alexsan2186": "Саша",
    "hezadono": "Тимур",
    "assyyyra": "Эмилия"
  }
};

function deleteFirebaseNode(path) {
  return new Promise((resolve, reject) => {
    const url = `${FIREBASE_BASE_URL}/${path}.json`;
    const req = https.request(url, { method: "DELETE" }, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve({ statusCode: res.statusCode, data }));
    });
    req.on("error", reject);
    req.end();
  });
}

function putFirebaseNode(path, data) {
  return new Promise((resolve, reject) => {
    const url = `${FIREBASE_BASE_URL}/${path}.json`;
    const payload = JSON.stringify(data);
    const req = https.request(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    }, res => {
      let resData = "";
      res.on("data", c => resData += c);
      res.on("end", () => resolve({ statusCode: res.statusCode, data: resData }));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log("🧹 Очистка Firebase Realtime Database от устаревших мок-столов...\n");

  for (const tableKey of ZOMBIE_TABLES) {
    process.stdout.write(`   Удаление /atmosphere/tables/${tableKey}... `);
    const res = await deleteFirebaseNode(`atmosphere/tables/${tableKey}`);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log("✅ УДАЛЁН");
    } else {
      console.log(`❌ Ошибка (${res.statusCode})`);
    }
  }

  console.log("\n📦 Сохранение официального динамического реестра ведущих в Firebase...");
  const regRes = await putFirebaseNode("atmosphere/dealers_registry", VALID_DEALERS_REGISTRY);
  if (regRes.statusCode >= 200 && regRes.statusCode < 300) {
    console.log("✅ Реестр 12 ведущих успешно сохранен в /atmosphere/dealers_registry");
  } else {
    console.log(`❌ Ошибка сохранения реестра: ${regRes.statusCode}`);
  }

  console.log("\n🎉 ОЧИСТКА И ОБНОВЛЕНИЕ FIREBASE УСПЕШНО ЗАВЕРШЕНЫ!");
}

if (require.main === module) {
  main().catch(err => {
    console.error("Ошибка:", err);
    process.exit(1);
  });
}

module.exports = { deleteFirebaseNode, putFirebaseNode, VALID_DEALERS_REGISTRY };
