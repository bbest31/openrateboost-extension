import process from 'process';
import jwt_decode from 'jwt-decode';
import { nanoid } from 'nanoid';

const URLS = {
  api: process.env.API_SERVER_URL || '',
  app: process.env.CLIENT_APP_URL || '',
  webstore: process.env.EXT_STORE_URL || '',
  mixpanel: 'https://api.mixpanel.com',
};

var emailBody = '';

function getRandomBytes() {
  const rndArray = new Uint8Array(32);
  crypto.getRandomValues(rndArray);
  return rndArray;
}

/**
 *
 * @param {*} str
 * @returns
 */
function base64URLEncode(buffer) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function getParameterByName(name, url = window.location.href) {
  name = name.replace(/[\[\]]/g, '\\$&');
  var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
    results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return '';
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

// Hash and base64-urlencode the verifier
async function windowSha256(buffer) {
  let bytes = new TextEncoder().encode(buffer);
  return await crypto.subtle.digest('SHA-256', bytes);
}

async function callApi(method, url, body) {
  const { access_token } = await chrome.storage.session.get('access_token');
  const headers = {
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
  };
  try {
    return fetch(url, {
      method: method,
      ...headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    console.error('Error calling API', err);
  }
  return null;
}

/**
 * stringToUrl - Attempts to convert a string to a URL object.
 * If the string is not a valid URL, it will attempt to treat it as an HTTP host and prepend 'http://' to it.
 * @param {string} input
 * @returns
 */
function stringToUrl(input) {
  // Start with treating the provided value as a URL
  try {
    return new URL(input);
  } catch {
    // ignore
  }
  // If that fails, try assuming the provided input is an HTTP host
  try {
    return new URL('http://' + input);
  } catch {
    // ignore
  }
  // If that fails ¯\_(ツ)_/¯
  return null;
}

/**
 *
 * @returns sub - the user id
 */
async function getUserSub() {
  // get the users sub from the id_token
  const { id_token } = await chrome.storage.session.get('id_token');
  const { sub } = jwt_decode(id_token);
  return sub;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'login') {
    (async () => {
      try {
        const redirectUri = chrome.identity.getRedirectURL();

        const inputBytes = getRandomBytes();
        const verifier = base64URLEncode(inputBytes);
        const shaHash = await windowSha256(verifier);
        const codeChallenge = base64URLEncode(shaHash);

        // Now we make a request to authorise the user using chrome's identity framework. We get a code back
        let options = {
          client_id: process.env.AUTH0_CLIENT_ID,
          redirect_uri: redirectUri,
          response_type: 'code',
          audience: process.env.AUTH0_AUDIENCE,
          scope: 'openid profile email',
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
        };

        let queryString = new URLSearchParams(options).toString();
        let url = stringToUrl(
          `https://${process.env.AUTH0_DOMAIN}/authorize?${queryString}`
        );
        let resultUrl = await chrome.identity.launchWebAuthFlow({
          url: url.href,
          interactive: true,
        });

        // We are now going to use that code to generate a token
        if (resultUrl) {
          const code = getParameterByName('code', resultUrl);
          const nonce = nanoid();
          const body = JSON.stringify({
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
            client_id: process.env.AUTH0_CLIENT_ID,
            code_verifier: verifier,
            code: code,
            nonce: nonce,
          });

          const result = await fetch(
            `https://${process.env.AUTH0_DOMAIN}/oauth/token`,
            {
              method: 'POST',
              body,
              headers: { 'Content-Type': 'application/json' },
            }
          );

          const data = await result.json();
          if (
            result &&
            data &&
            data.access_token &&
            data.expires_in &&
            data.id_token
          ) {
            await chrome.storage.session.set({
              access_token: data.access_token,
              expires_in: data.expires_in,
              id_token: data.id_token,
            });
            // console.log('Auth0 Authentication Data was valid');
            sendResponse({ result: true });
          } else {
            console.log('Auth0 Authentication Data was invalid');
            sendResponse({ result: false });
          }
        } else {
          console.log('Auth0 Cancelled or error. resultUrl', resultUrl);
          sendResponse({ result: false });
        }
      } catch (e) {
        // some error or user cancelled the request.
        console.log('Login Error', e);
        sendResponse({ result: false });
      }
    })();
  } else if (request.type === 'getUserInfo') {
    // get user info from auth0 including user metadata
    (async () => {
      const sub = await getUserSub();
      const res = await callApi('GET', `${URLS.api}/users/${sub}`);
      if (res) {
        const userInfo = await res.json();
        sendResponse({ result: userInfo });
      } else {
        // respond with error
        sendResponse({ result: null });
      }
    })();
  } else if (request.type === 'generateSubjectLines') {
    (async () => {
      try {
        const sub = await getUserSub();
        const res = await callApi(
          'POST',
          `${URLS.api}/users/${sub}/subject-lines?creativity=${request.payload.creativity}&lowercase=${request.payload.lowercase}`,
          { email: request.payload.emailBody }
        );
        if (res.status === 200) {
          const subjectLines = await res.json();
          sendResponse({ result: subjectLines });
        } else {
          // respond with error
          sendResponse({ result: null });
        }
      } catch (e) {
        console.log('Error generating subject lines', e);
        sendResponse({ result: null });
      }
    })();
  } else if (request.type === 'emailSent') {
    // update the user count of the subject line if it's one we generated
    (async () => {
      const sub = await getUserSub();
      const res = await callApi(
        'PATCH',
        `${URLS.api}/users/${sub}/subject-lines/use-count`,
        { subjectLine: request.payload.subjectLine }
      );
      if (res.status === 200) {
        sendResponse({ result: true });
      } else {
        sendResponse({ result: null });
      }
    })();
  } else if (request.type === 'trackingPixel') {
    (async () => {
      const sub = await getUserSub();
      const res = await callApi(
        'PATCH',
        `${URLS.api}/users/${sub}/subject-lines/pixels`,
        {
          subjectLine: request.payload.subjectLine,
          pixelId: request.payload.pixelId,
        }
      );
      if (res.status === 200) {
        sendResponse({ result: true });
      } else {
        sendResponse({ result: null });
      }
    })();
  } else if (request.type === 'inboxsdk__injectPageWorld' && sender.tab) {
    if (chrome.scripting) {
      // MV3
      chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        world: 'MAIN',
        files: ['pageWorld.js'],
      });
      sendResponse(true);
    } else {
      // MV2 fallback. Tell content script it needs to figure things out.
      sendResponse(false);
    }
  } else if (request.type === 'isAuth') {
    /**
     * Checks if the user is authenticated by checking if the access_token, expires_in, and id_token are in session storage.
     */
    (async () => {
      const res = await chrome.storage.session.get([
        'access_token',
        'expires_in',
        'id_token',
      ]);
      if (res.access_token && res.expires_in && res.id_token) {
        sendResponse({ result: true });
      } else {
        sendResponse({ result: false });
      }
    })();
  } else if (request.type === 'openPopup') {
    //open the popup.jsx window
    chrome.windows.create({
      url: chrome.runtime.getURL('popup.html'),
      type: 'popup',
      tabId: sender.tab.id,
      width: 650,
      height: 600,
    });
    emailBody = request.payload.emailBody;
  } else if (request.type === 'getEmailBody') {
    //send the email body to the popup.jsx window that was retrieved from the content script.
    sendResponse({ result: { emailBody: emailBody } });
    emailBody = '';
  } else {
    console.log(request);
  }
  return true;
});

// send message to content script
// (async () => {
//   const [tab] = await chrome.tabs.query({
//     active: true,
//     lastFocusedWindow: true,
//   });
//   const response = await chrome.tabs.sendMessage(tab.id, { greeting: 'hello' });
//   // do something with response here, not outside the function
//   console.log(response);
// })();

// listen for message from content script
// chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
//   console.log(
//     sender.tab
//       ? 'from a content script:' + sender.tab.url
//       : 'from the extension'
//   );
//   if (request.greeting === 'hello') sendResponse({ farewell: 'goodbye' });
// });
