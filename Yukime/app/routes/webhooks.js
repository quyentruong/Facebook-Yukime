/**
 * Created by Quyen on 10/22/2016.
 */
var apiController = require('../controller/api');

var express = require('express');
var router = express.Router();

router.get('/', apiController.tokenVerification);
router.post('/', apiController.handleMessage);

module.exports = router;