const express = require('express');
const { createDocumentRouter } = require('./routes/documentRoutes');
const { handleError } = require('./controllers/documentController');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use(createDocumentRouter());
app.use(handleError);

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info('server.started', { port: PORT });
  });
}

module.exports = app;
