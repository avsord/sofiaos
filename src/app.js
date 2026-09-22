'use strict';
// Express continua sendo a aplicação HTTP. A lógica comum e testável fica no Core.
const express = require('express');
function createApp(runtime) {
  const app=express();
  app.disable('x-powered-by');
  app.set('trust proxy',false);
  app.use(runtime.handler);
  return app;
}
module.exports={createApp};
