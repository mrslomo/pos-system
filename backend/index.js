// Firebase Functions entry point
const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');

setGlobalOptions({ region: 'asia-southeast1', memory: '512MiB', timeoutSeconds: 60 });

// Lazy-load Express app to speed up cold starts
let app;
const getApp = () => {
  if (!app) app = require('./src/app-firebase');
  return app;
};

exports.api = onRequest({ invoker: 'public' }, (req, res) => {
  return getApp()(req, res);
});
