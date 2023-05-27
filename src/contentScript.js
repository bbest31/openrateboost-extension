import * as InboxSDK from '@inboxsdk/core';
const { v4: uuidv4 } = require('uuid');
import './contentScript.css';
// send message to background script
// chrome.runtime.sendMessage({ type: 'contentScript' });

// chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
//   if (request.type === 'contentScript') {
//     console.log('got msg from background');
//   }
// });

var pixelId;

async function checkIsAuthenticated() {
  const res = await chrome.runtime.sendMessage({ type: 'isAuth' });
  if (res?.result === true) {
    return true;
  } else {
    return false;
  }
}

async function renderComposeNotice(composeView) {
  // parent element to hold compose notice
  let parent = document.createElement('div');
  // container element for flexbox
  let composeContainer = document.createElement('div');
  composeContainer.id = 'composeContainer';
  // main action button
  let composeButton = document.createElement('button');
  composeButton.id = 'composeButton';
  let composeBtnText = document.createElement('div');
  composeBtnText.style.fontFamily = 'Source Sans Pro';

  const isAuth = await checkIsAuthenticated();
  if (isAuth === true) {
    renderGenerateComposeNotice(
      composeButton,
      composeBtnText,
      composeView,
      true
    );
  } else {
    renderLoginComposeNotice(composeButton, composeBtnText, composeView);
  }

  // middle spacer
  let composeSpacer = document.createElement('div');
  composeSpacer.id = 'spacer';

  // icon  + anchor
  let composeIcon = document.createElement('img');
  composeIcon.src = chrome.runtime.getURL('images/icon32.png');
  composeIcon.alt = chrome.i18n.getMessage('extName');
  composeIcon.style.marginRight = '4px';

  let composeIconAnchor = document.createElement('a');
  composeIconAnchor.href = `${process.env.CLIENT_APP_URL}/dashboard`;
  composeIconAnchor.target = '_blank';
  composeIconAnchor.appendChild(composeIcon);

  // compose notice view
  composeContainer.appendChild(composeButton);
  composeContainer.appendChild(composeSpacer);
  composeContainer.appendChild(composeIconAnchor);
  parent.appendChild(composeContainer);
  let hr = document.createElement('hr');
  parent.appendChild(hr);
  return parent;
}

/**
 * Renders the compose notice when the user is not logged in.
 * @param {HTMLButtonElement} button
 * @param {HTMLDivElement} buttonText
 * @param {InboxSDK.ComposeView} composeView
 */
function renderLoginComposeNotice(button, buttonText, composeView) {
  button.className = 'primaryOutlineBtn';
  buttonText.innerText = chrome.i18n.getMessage('loginToOpenRateBoost');
  button.appendChild(buttonText);
  button.onclick = function () {
    (async () => {
      const res = await chrome.runtime.sendMessage({ type: 'login' });
      if (res.result === true) {
        renderGenerateComposeNotice(button, buttonText, composeView, false);
      }
    })();
  };
}

/**
 * Renders the compose notice when the user is logged in.
 * @param {HTMLButtonElement} button
 * @param {HTMLDivElement} buttonText
 * @param {InboxSDK.ComposeView} composeView
 * @param {boolean} initial - indicates if the compose notice is being rendered for the first time
 */
function renderGenerateComposeNotice(button, buttonText, composeView, initial) {
  // render generate subject line button
  button.className = 'primaryContainedBtn';
  buttonText.innerText = chrome.i18n.getMessage('generateSubjectLines');
  if (initial === true) {
    button.appendChild(buttonText);
  }
  button.onclick = function () {
    chrome.runtime.sendMessage({
      type: 'openPopup',
      payload: { emailBody: composeView.getTextContent() },
    });
  };
}

InboxSDK.load(2, process.env.INBOXSDK_APP_ID).then((sdk) => {
  sdk.Compose.registerComposeViewHandler((composeView) => {
    pixelId = uuidv4();
    let link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href =
      'https://fonts.googleapis.com/css2?family=Source+Sans+Pro:ital,wght@0,200;0,300;0,400;0,600;0,700;0,900;1,200;1,300;1,400;1,600;1,700;1,900&display=swap';
    document.head.appendChild(link);

    (async () => {
      let parent = await renderComposeNotice(composeView);
      let composeNoticeView = composeView.addComposeNotice();
      composeNoticeView.el.style.padding = '0px';
      composeNoticeView.el.style.margin = '0px';
      composeNoticeView.el.style.background = 'transparent';
      composeNoticeView.el.appendChild(parent);
    })();

    composeView.on('presending', () => {
      // attach tracking pixel
      let trackingPixel = document.createElement('img'); // Create a new image element
      trackingPixel.src = `${process.env.API_SERVER_URL}/tracking_pixel.png?uuid=${pixelId}`; // Set the source URL of the tracking pixel image
      trackingPixel.width = 1; // Set the width of the tracking pixel image to 1 pixel
      trackingPixel.height = 1; // Set the height of the tracking pixel image to 1 pixel
      trackingPixel.style.opacity = 0; // Set the opacity of the tracking pixel image to 0 to make it invisible
      composeView.getBodyElement().appendChild(trackingPixel); // Append the tracking pixel image to the body of the email
      (async () => {
        const isAuth = await checkIsAuthenticated();
        if (isAuth === true) {
          // send pixel uuid to background script to be saved in db
          chrome.runtime.sendMessage({
            type: 'trackingPixel',
            payload: { pixelId, subjectLine: composeView.getSubject() },
          });
        }
        // } else {
        //   // remove pixel if user is not logged in
        //   let pixel = document.querySelector(`img[src*="${pixelId}"]`);
        //   pixel.remove();
        // }
      })();
    });

    composeView.on('sending', () => {
      (async () => {
        const isAuth = await checkIsAuthenticated();
        if (isAuth === true) {
          // increment use count if subject line is in db
          chrome.runtime.sendMessage({
            type: 'emailSent',
            payload: { subjectLine: composeView.getSubject() },
          });
        }
      })();
    });
  });
});
