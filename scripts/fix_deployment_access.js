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
      res.on('end', () => resolve(JSON.parse(data).access_token));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function createPublicDeployment(accessToken) {
  const claspConfig = JSON.parse(fs.readFileSync('c:/vibe/.clasp.json', 'utf8'));
  const scriptId = claspConfig.scriptId;

  // Создаем чистый публичный деплоймент с доступом для всех
  const body = JSON.stringify({
    versionNumber: 109,
    manifestFileName: "appsscript",
    description: "Public Telegram Bot Webhook v109 (Zero Spam Edition)"
  });

  return new Promise((resolve, reject) => {
    const req = https.request('https://script.googleapis.com/v1/projects/' + scriptId + '/deployments', {
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
        if (res.statusCode === 200) {
          const json = JSON.parse(data);
          resolve(json);
        } else {
          reject(new Error('Create deployment error (' + res.statusCode + '): ' + data));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function setTelegramWebhook(url) {
  const token = process.env.DEALER_BOT_TOKEN;
  if (!token) return { ok: false, error: 'NO_TOKEN' };
  return new Promise((resolve, reject) => {
    const tgUrl = 'https://api.telegram.org/bot' + token + '/setWebhook?url=' + encodeURIComponent(url) + '&drop_pending_updates=true';
    https.get(tgUrl, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        console.log('🤖 Telegram setWebhook ответ:', data);
        resolve(JSON.parse(data));
      });
    }).on('error', reject);
  });
}

async function setChatMenuButton() {
  const token = process.env.DEALER_BOT_TOKEN;
  if (!token) return;
  const appUrl = process.env.DEALER_APP_URL || 'https://atmosphere-poker.vercel.app/dealer';
  const payload = JSON.stringify({
    menu_button: {
      type: "web_app",
      text: "🎛 Пульт",
      web_app: {
        url: appUrl
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
        console.log('🔘 Постоянная кнопка меню Telegram установлена:', data);
        resolve(data);
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const token = await getAccessToken();
  const dep = await createPublicDeployment(token);
  
  if (dep && dep.entryPoints) {
    const webAppEp = dep.entryPoints.find(ep => ep.webApp);
    if (webAppEp && webAppEp.webApp && webAppEp.webApp.url) {
      console.log('🌐 Новый Web App URL:', webAppEp.webApp.url);
      await setTelegramWebhook(webAppEp.webApp.url);
      await setChatMenuButton();
    }
  }
}

main();
