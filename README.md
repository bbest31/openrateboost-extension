# OpenRateBoost Chrome Ext.
Official Chrome extension for OpenRateBoost, an AI-powered app designed to boost email open rates by generating optimized subject lines for your emails.

## Build & Run

### .env file
The dotenv files must be denoted based on which environment they are for:
* `dev.env` is for development
* `staging.env` is for staging
* `.env` is for production

The following have development examples
```
API_SERVER_URL=http://localhost:8000/api/v1
CLIENT_APP_URL=http://localhost:3000
EXT_STORE_URL=https://chrome.google.com/webstore/category/extensions

AUTH0_CLIENT_ID=<client id of client app>
AUTH0_DOMAIN=
AUTH0_REDIRECT_URI=chrome-extension://<extension id>
AUTH0_AUDIENCE=
AUTH0_SCOPE=openid profile email read:current_user read:current_user_metadata read:user_idp_tokens

MIXPANEL_TOKEN=

INBOXSDK_APP_ID=
```

Inside this directory, you can run below commands:

  `npm run watch`
    Listens for files changes and rebuilds automatically using the development environment.

  `npm run watch:staging`
    Listens for files changes and rebuilds automatically using the staging environment.

  `npm run build`
    Bundles the app into static files for Chrome store.

  `npm run format`
    Formats all the files.

We suggest that you begin by typing:

  1. Run npm run watch
  2. Open chrome://extensions
  3. Check the Developer mode checkbox
  4. Click on the Load unpacked extension button
  5. Select the ./build folder

This project was bootstrapped with [Chrome Extension CLI](https://github.com/dutiyesh/chrome-extension-cli)
