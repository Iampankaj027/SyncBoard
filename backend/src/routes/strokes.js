const express = require('express');
const router = express.Router();
const { getStrokes, saveStroke, clearStrokes } = require('../controllers/strokesController');

router.get('/:roomId', getStrokes);
router.post('/', saveStroke);
router.delete('/:roomId', clearStrokes);

module.exports = router;