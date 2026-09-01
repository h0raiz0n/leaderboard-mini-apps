const fs = require('fs');
const https = require('https');

async function getAccessToken() {
  const clasprc = JSON.parse(fs.readFileSync('C:/Users/vladi/.clasprc.json', 'utf8'));
  const defaultToken = clasprc.tokens.default;
  
  const postData = new URLSearchParams({
    client_id: defaultToken.client_id,
    client_secret: defaultToken.client_secret,
    refresh_token: defaultToken.refresh_token,
    grant_type: 'refresh_token'
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.access_token) {
            console.log('✅ Google OAuth Access Token успешно получен');
            resolve(json.access_token);
          } else {
            reject(new Error('Token refresh failed: ' + data));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function pushToAppsScript(accessToken) {
  const claspConfig = JSON.parse(fs.readFileSync('c:/vibe/.clasp.json', 'utf8'));
  const scriptId = claspConfig.scriptId;

  const filesToPush = [
    { name: 'appsscript', type: 'JSON', path: 'c:/vibe/appsscript.json' },
    { name: 'Config', type: 'SERVER_JS', path: 'c:/vibe/Config.js' },
    { name: 'DealerBot', type: 'SERVER_JS', path: 'c:/vibe/DealerBot.js' },
    { name: 'FirebaseSync', type: 'SERVER_JS', path: 'c:/vibe/FirebaseSync.js' },
    { name: 'Code', type: 'SERVER_JS', path: 'c:/vibe/Code.js' },
    { name: 'Setup', type: 'SERVER_JS', path: 'c:/vibe/Setup.js' },
    { name: 'Normalizer', type: 'SERVER_JS', path: 'c:/vibe/Normalizer.js' },
    { name: 'Leaderboard', type: 'SERVER_JS', path: 'c:/vibe/Leaderboard.js' },
    { name: 'Analytics', type: 'SERVER_JS', path: 'c:/vibe/Analytics.js' },
    { name: 'Backfill', type: 'SERVER_JS', path: 'c:/vibe/Backfill.js' },
    { name: 'TelegramNotifier', type: 'SERVER_JS', path: 'c:/vibe/TelegramNotifier.js' },
    { name: 'Formatting', type: 'SERVER_JS', path: 'c:/vibe/Formatting.js' },
    { name: 'GameManager', type: 'HTML', path: 'c:/vibe/GameManager.html' }
  ];

  const payloadFiles = filesToPush.map(f => {
    const source = fs.readFileSync(f.path, 'utf8');
    return {
      name: f.name,
      type: f.type,
      source: source
    };
  });

  const body = JSON.stringify({ files: payloadFiles });

  return new Promise((resolve, reject) => {
    const req = https.request('https://script.googleapis.com/v1/projects/' + scriptId + '/content', {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('🚀 ВСЕ ФАЙЛЫ УСПЕШНО ЗАГРУЖЕНЫ В GOOGLE APPS SCRIPT!');
          console.log('   Всего файлов: ' + filesToPush.length + ' шт (включая DealerBot.js и FirebaseSync.js)');
          resolve(JSON.parse(data));
        } else {
          reject(new Error('Apps Script API error (' + res.statusCode + '): ' + data));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getDeployments(accessToken) {
  const claspConfig = JSON.parse(fs.readFileSync('c:/vibe/.clasp.json', 'utf8'));
  const scriptId = claspConfig.scriptId;

  return new Promise((resolve, reject) => {
    const req = https.request('https://script.googleapis.com/v1/projects/' + scriptId + '/deployments', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + accessToken
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const json = JSON.parse(data);
          resolve(json.deployments || []);
        } else {
          reject(new Error('Get deployments error (' + res.statusCode + '): ' + data));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function createNewVersionAndDeploy(accessToken, webAppUrl) {
  const claspConfig = JSON.parse(fs.readFileSync('c:/vibe/.clasp.json', 'utf8'));
  const scriptId = claspConfig.scriptId;

  // Создаем новую версию скрипта
  const versionObj = await new Promise((resolve, reject) => {
    const body = JSON.stringify({ description: "Live dealer bot & TV HUD release" });
    const req = https.request('https://script.googleapis.com/v1/projects/' + scriptId + '/versions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error('Create version error: ' + data));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  console.log('📦 Создана новая версия скрипта №' + versionObj.versionNumber);
  return versionObj;
}

async function updateDeployment(accessToken, deploymentId, versionNumber) {
  const claspConfig = JSON.parse(fs.readFileSync('c:/vibe/.clasp.json', 'utf8'));
  const scriptId = claspConfig.scriptId;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      deploymentConfig: {
        versionNumber: versionNumber,
        manifestFileName: "appsscript",
        description: "Release v" + versionNumber
      }
    });

    const req = https.request('https://script.googleapis.com/v1/projects/' + scriptId + '/deployments/' + deploymentId, {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('🔄 Деплоймент ' + deploymentId + ' успешно переключен на версию №' + versionNumber);
          resolve(JSON.parse(data));
        } else {
          console.warn('Предупреждение при обновлении деплоймента: ' + data);
          resolve(null);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function registerTelegramWebhook(webAppUrl) {
  const token = process.env.DEALER_BOT_TOKEN || "8946471319:AAHKuZK8hcgebOvuNyHi21o5tjlbU7S0hG8";
  return new Promise((resolve, reject) => {
    const url = 'https://api.telegram.org/bot' + token + '/setWebhook?url=' + encodeURIComponent(webAppUrl) + '&drop_pending_updates=true';
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('🤖 Telegram Webhook результат: ' + data);
        resolve(JSON.parse(data));
      });
    }).on('error', reject);
  });
}

async function setBotCommands() {
  const token = "8946471319:AAHKuZK8hcgebOvuNyHi21o5tjlbU7S0hG8";
  const payload = JSON.stringify({
    commands: [
      { command: "start", description: "Запустить новый стол или открыть управление" },
      { command: "help", description: "Справка по управлению турниром" }
    ]
  });

  return new Promise((resolve, reject) => {
    const req = https.request('https://api.telegram.org/bot' + token + '/setMyCommands', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('📋 Команды бота установлены: ' + data);
        resolve(data);
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  try {
    const token = await getAccessToken();
    await pushToAppsScript(token);
    const versionObj = await createNewVersionAndDeploy(token);
    
    const deployments = await getDeployments(token);
    let webAppUrl = '';
    for (const d of deployments) {
      if (d.entryPoints && d.entryPoints.some(ep => ep.webApp)) {
        await updateDeployment(token, d.deploymentId, versionObj.versionNumber);
        const webEp = d.entryPoints.find(ep => ep.webApp);
        if (webEp) webAppUrl = webEp.webApp.url;
      }
    }

    if (webAppUrl) {
      console.log('\n🌐 Активный Web App URL: ' + webAppUrl);
      console.log('🔗 Регистрируем Webhook в Telegram...');
      await registerTelegramWebhook(webAppUrl);
      await setBotCommands();
      await setChatMenuButton();
    }

    console.log('\n🎉 ДЕПЛОЙ И НАСТРОЙКА ПОЛНОСТЬЮ ЗАВЕРШЕНЫ!');
  } catch (err) {
    console.error('❌ Ошибка:', err.message);
  }
}

async function setChatMenuButton() {
  const token = "8946471319:AAHKuZK8hcgebOvuNyHi21o5tjlbU7S0hG8";
  const payload = JSON.stringify({
    menu_button: {
      type: "web_app",
      text: "🎛 Пульт",
      web_app: {
        url: "https://h0raiz0n.github.io/leaderboard-mini-apps/dealer/"
      }
    }
  });

  return new Promise((resolve, reject) => {
    const req = https.request('https://api.telegram.org/bot' + token + '/setChatMenuButton', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('🔘 Постоянная кнопка меню Telegram установлена: ' + data);
        resolve(data);
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

main();
